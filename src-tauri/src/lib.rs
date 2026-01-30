mod calendar;
mod power;

use futures_util::{SinkExt, StreamExt};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{
    menu::MenuBuilder,
    menu::MenuItemBuilder,
    tray::{TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State, Window,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};
use tokio::sync::{mpsc, oneshot};
use tokio_tungstenite::{connect_async, tungstenite::Message};
use power::WakeLock;

const SOURCE_SAMPLE_RATE: u32 = 48_000;
const TARGET_SAMPLE_RATE: u32 = 16_000;
const FRAME_SIZE: usize = 480; // 10ms at 48 kHz
const MIN_BUFFER_THRESHOLD: usize = FRAME_SIZE / 2;
const DEFAULT_RT_URL: &str = "wss://eu2.rt.speechmatics.com/v2";

#[derive(Default)]
pub struct AppState {
    capture_state: Arc<Mutex<Option<CaptureHandle>>>,
    recording: Arc<Mutex<Option<RecordingSession>>>,
    is_muted: Arc<Mutex<bool>>,
    transcript: Arc<Mutex<String>>,
    wake_lock: Arc<Mutex<Option<WakeLock>>>,
}

struct CaptureHandle {
    stop_tx: std::sync::mpsc::Sender<()>,
    task: std::thread::JoinHandle<()>,
}

struct RecordingSession {
    mic_tx: mpsc::UnboundedSender<Vec<f32>>,
    stop_tx: Option<oneshot::Sender<()>>,
    task: tauri::async_runtime::JoinHandle<()>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StartRecordingArgs {
    #[serde(alias = "apiKey")]
    api_key: String,
    #[serde(alias = "additionalVocab", alias = "additional_vocab")]
    additional_vocab: Option<Vec<AdditionalVocabularyEntry>>,
    #[serde(alias = "speakerProfile", alias = "speaker_profile")]
    speaker_profile: Option<SpeakerProfileArg>,
    #[serde(default, alias = "rtUrl", alias = "rt_url")]
    rt_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct AdditionalVocabularyEntry {
    content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    sounds_like: Option<Vec<String>>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SpeakerProfileArg {
    label: String,
    #[serde(alias = "speakerIdentifiers")]
    speaker_identifiers: Vec<String>,
}

#[derive(Debug, Serialize, Clone)]
struct TranscriptTurnPayload {
    #[serde(skip_serializing_if = "Option::is_none")]
    speaker: Option<String>,
    text: String,
}

#[derive(Debug, Serialize, Clone)]
struct TranscriptUpdate {
    text: String,
    is_partial: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    turns: Option<Vec<TranscriptTurnPayload>>,
}

#[derive(Debug, Serialize)]
struct SpeechmaticsConfig {
    message: String,
    transcription_config: TranscriptionConfig,
    audio_format: AudioFormat,
}

#[derive(Debug, Serialize)]
struct TranscriptionConfig {
    language: String,
    enable_partials: bool,
    operating_point: String,
    max_delay: f32,
    #[serde(skip_serializing_if = "Option::is_none")]
    diarization: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    additional_vocab: Option<Vec<AdditionalVocabularyEntry>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    speaker_diarization_config: Option<SpeakerDiarizationConfig>,
}

#[derive(Debug, Serialize)]
struct SpeakerDiarizationConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    get_speakers: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    speakers: Option<Vec<KnownSpeaker>>,
}

#[derive(Debug, Serialize)]
struct KnownSpeaker {
    label: String,
    speaker_identifiers: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SpeakersResultMessage {
    message: String,
    #[serde(default)]
    speakers: Option<Vec<SpeakersResultEntry>>,
    #[serde(default)]
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SpeakersResultEntry {
    #[allow(dead_code)]
    #[serde(default)]
    label: Option<String>,
    #[serde(default)]
    speaker_identifiers: Option<Vec<String>>,
}

#[derive(Debug, Serialize)]
struct AudioFormat {
    #[serde(rename = "type")]
    format_type: String,
    encoding: String,
    sample_rate: u32,
}

#[derive(Debug, Serialize)]
struct EndOfStreamMessage {
    message: String,
    last_seq_no: u32,
}

#[derive(Debug, Deserialize)]
struct SpeechmaticsMessage {
    message: String,
    #[serde(default)]
    results: Vec<SpeechmaticsResult>,
    #[serde(default)]
    error: Option<String>,
    #[serde(default)]
    metadata: Option<SpeechmaticsMetadata>,
}

#[derive(Debug, Deserialize, Clone)]
struct SpeechmaticsResult {
    #[serde(default)]
    alternatives: Vec<SpeechmaticsAlternative>,
}

#[derive(Debug, Deserialize, Clone)]
struct SpeechmaticsAlternative {
    #[serde(default)]
    content: Option<AlternativeContent>,
    #[serde(default)]
    text: Option<String>,
    #[serde(default)]
    speaker: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(untagged)]
enum AlternativeContent {
    Simple(String),
    Parts(Vec<SpeechmaticsContent>),
}

#[derive(Debug, Deserialize, Clone)]
#[serde(untagged)]
enum SpeechmaticsContent {
    Plain(String),
    #[serde(rename_all = "camelCase")]
    Rich {
        #[serde(rename = "type")]
        _kind: Option<String>,
        #[serde(default)]
        content: Option<String>,
        #[serde(default)]
        text: Option<String>,
    },
}

#[derive(Debug, Deserialize, Default, Clone)]
struct SpeechmaticsMetadata {
    #[serde(default)]
    transcript: Option<String>,
}

fn extract_text(msg: &SpeechmaticsMessage) -> Option<String> {
    if let Some(meta) = &msg.metadata {
        if let Some(transcript) = &meta.transcript {
            if !transcript.trim().is_empty() {
                return Some(clean_punctuation(transcript.trim()));
            }
        }
    }

    let partial: String = msg
        .results
        .iter()
        .filter_map(|r| r.alternatives.first())
        .filter_map(|alt| alt.text())
        .collect::<Vec<_>>()
        .join(" ");

    if !partial.trim().is_empty() {
        return Some(clean_punctuation(&partial));
    }

    None
}

impl SpeechmaticsAlternative {
    fn text(&self) -> Option<String> {
        if let Some(text) = &self.text {
            let cleaned = clean_punctuation(text);
            if cleaned.trim().is_empty() {
                return None;
            }
            return Some(cleaned);
        }

        self.content.as_ref().and_then(|content| match content {
            AlternativeContent::Simple(value) => {
                let trimmed = value.trim();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(clean_punctuation(trimmed))
                }
            }
            AlternativeContent::Parts(parts) => {
                let mut combined = String::new();
                for part in parts {
                    match part {
                        SpeechmaticsContent::Plain(value) => combined.push_str(value),
                        SpeechmaticsContent::Rich { content, text, .. } => {
                            if let Some(value) = content {
                                combined.push_str(value);
                            } else if let Some(value) = text {
                                combined.push_str(value);
                            }
                        }
                    }
                }
                let cleaned = clean_punctuation(&combined);
                if cleaned.trim().is_empty() {
                    None
                } else {
                    Some(cleaned)
                }
            }
        })
    }
}

#[tauri::command]
async fn start_recording(
    app: AppHandle,
    window: Window,
    state: State<'_, AppState>,
    args: StartRecordingArgs,
) -> Result<(), String> {
    // Clear any stale recording state before starting
    let mut recording_guard = state.recording.lock();
    if recording_guard.is_some() {
        // Clean up stale state
        recording_guard.take();
    }
    drop(recording_guard);

    {
        let mut transcript = state.transcript.lock();
        transcript.clear();
    }
    {
        let mut muted = state.is_muted.lock();
        *muted = false;
    }

    stop_capture(state.capture_state.clone());
    release_wake_lock(&state.wake_lock);

    let (screen_tx, screen_rx) = mpsc::unbounded_channel::<Vec<f32>>();
    spawn_screen_capture(app.clone(), state.capture_state.clone(), Some(screen_tx))?;

    let (mic_tx, mic_rx) = mpsc::unbounded_channel::<Vec<f32>>();
    let (stop_tx, stop_rx) = oneshot::channel();
    let wake_lock_state = state.wake_lock.clone();

    {
        let wake_lock = WakeLock::acquire("Meeting Transcriber is recording")
            .map(Some)
            .map_err(|err| {
                eprintln!("Failed to acquire wake lock: {}", err);
                err
            })
            .unwrap_or(None);
        let mut guard = wake_lock_state.lock();
        *guard = wake_lock;
    }

    let transcript_state = state.transcript.clone();
    let is_muted = state.is_muted.clone();
    let StartRecordingArgs {
        api_key,
        additional_vocab,
        speaker_profile,
        rt_url,
    } = args;
    let additional_vocab = additional_vocab.unwrap_or_default();
    let speaker_profile_clone = speaker_profile.clone();

    let task = tauri::async_runtime::spawn(async move {
        if let Err(err) = run_transcription(
            api_key,
            additional_vocab,
            speaker_profile_clone,
            rt_url,
            screen_rx,
            mic_rx,
            stop_rx,
            window.clone(),
            transcript_state,
            is_muted,
            wake_lock_state.clone(),
        )
        .await
        {
            let _ = window.emit("recording-error", err.clone());
            let _ = window.emit("recording-ended", ());
        }
    });

    *state.recording.lock() = Some(RecordingSession {
        mic_tx,
        stop_tx: Some(stop_tx),
        task,
    });

    Ok(())
}

#[tauri::command]
async fn push_mic_audio_chunk(state: State<'_, AppState>, samples: Vec<f32>) -> Result<(), String> {
    if let Some(session) = state.recording.lock().as_ref() {
        let payload = if *state.is_muted.lock() {
            vec![0.0; samples.len()]
        } else {
            samples
        };

        session
            .mic_tx
            .send(payload)
            .map_err(|_| "Recording is no longer active".to_string())
    } else {
        Err("Not currently recording".to_string())
    }
}

#[tauri::command]
async fn stop_recording(state: State<'_, AppState>) -> Result<(), String> {
    stop_capture(state.capture_state.clone());

    let mut session_opt = { state.recording.lock().take() };
    if let Some(mut session) = session_opt.take() {
        if let Some(stop) = session.stop_tx.take() {
            let _ = stop.send(());
        }
        let _ = session.task.await;
        release_wake_lock(&state.wake_lock);
        Ok(())
    } else {
        release_wake_lock(&state.wake_lock);
        Err("Not recording".to_string())
    }
}

#[tauri::command]
async fn mute_recording(state: State<'_, AppState>) -> Result<(), String> {
    let mut is_muted = state.is_muted.lock();
    *is_muted = true;
    Ok(())
}

#[tauri::command]
async fn unmute_recording(state: State<'_, AppState>) -> Result<(), String> {
    let mut is_muted = state.is_muted.lock();
    *is_muted = false;
    Ok(())
}

#[tauri::command]
async fn toggle_mute(state: State<'_, AppState>, window: Window) -> Result<bool, String> {
    let mut is_muted = state.is_muted.lock();
    *is_muted = !*is_muted;
    let new_state = *is_muted;
    drop(is_muted);

    let _ = window.emit("mute-status-changed", new_state);

    Ok(new_state)
}

#[tauri::command]
async fn get_mute_status(state: State<'_, AppState>) -> Result<bool, String> {
    Ok(*state.is_muted.lock())
}

fn release_wake_lock(wake_lock_state: &Arc<Mutex<Option<WakeLock>>>) {
    let mut guard = wake_lock_state.lock();
    if let Some(mut lock) = guard.take() {
        lock.release();
    }
}

struct WakeLockGuard {
    wake_lock_state: Arc<Mutex<Option<WakeLock>>>,
}

impl Drop for WakeLockGuard {
    fn drop(&mut self) {
        release_wake_lock(&self.wake_lock_state);
    }
}

fn stop_capture(capture_state: Arc<Mutex<Option<CaptureHandle>>>) {
    let handle = { capture_state.lock().take() };
    if let Some(CaptureHandle { stop_tx, task }) = handle {
        let _ = stop_tx.send(());
        let _ = task.join();
    }
}

fn spawn_screen_capture(
    app: AppHandle,
    capture_state: Arc<Mutex<Option<CaptureHandle>>>,
    pcm_tx: Option<mpsc::UnboundedSender<Vec<f32>>>,
) -> Result<(), String> {
    #[cfg(not(target_os = "macos"))]
    {
        let _ = pcm_tx;
        return Err("ScreenCaptureKit capture is only available on macOS 12+".into());
    }

    #[cfg(target_os = "macos")]
    {
        let mut guard = capture_state.lock();
        if guard.is_some() {
            return Err("Capture already running".into());
        }
        let (stop_tx, stop_rx) = std::sync::mpsc::channel();
        let app_handle = app.clone();
        let capture_state_handle = capture_state.clone();

        let task = std::thread::spawn(move || {
            let result = sc_audio_loop(app_handle.clone(), stop_rx, pcm_tx);
            capture_state_handle.lock().take();

            if let Err(err) = result {
                let _ = app_handle.emit("capture-error", err.to_string());
            }
        });

        *guard = Some(CaptureHandle { stop_tx, task });
        Ok(())
    }
}

#[cfg(target_os = "macos")]
fn sc_audio_loop(
    app: AppHandle,
    stop_rx: std::sync::mpsc::Receiver<()>,
    pcm_tx: Option<mpsc::UnboundedSender<Vec<f32>>>,
) -> Result<(), anyhow::Error> {
    use core_foundation::error::CFError;
    use screencapturekit::{
        shareable_content::SCShareableContent,
        stream::{
            configuration::SCStreamConfiguration, content_filter::SCContentFilter,
            output_trait::SCStreamOutputTrait, output_type::SCStreamOutputType, SCStream,
        },
    };
    use std::sync::Mutex as StdMutex;
    use std::thread;

    fn cf_error_to_anyhow(err: CFError) -> anyhow::Error {
        anyhow::anyhow!("{err:?}")
    }

    let content = SCShareableContent::get().map_err(cf_error_to_anyhow)?;
    let display = content
        .displays()
        .into_iter()
        .next()
        .ok_or_else(|| anyhow::anyhow!("No displays found to capture"))?;

    let config = SCStreamConfiguration::new()
        .set_captures_audio(true)
        .map_err(cf_error_to_anyhow)?
        .set_excludes_current_process_audio(false)
        .map_err(cf_error_to_anyhow)?
        .set_sample_rate(SOURCE_SAMPLE_RATE)
        .map_err(cf_error_to_anyhow)?
        .set_channel_count(1)
        .map_err(cf_error_to_anyhow)?;

    let filter = SCContentFilter::new().with_display_excluding_windows(&display, &[]);

    struct AudioLevelOutput {
        app: AppHandle,
        last_emit: StdMutex<Instant>,
        pcm_tx: Option<mpsc::UnboundedSender<Vec<f32>>>,
    }

    impl SCStreamOutputTrait for AudioLevelOutput {
        fn did_output_sample_buffer(
            &self,
            sample_buffer: screencapturekit::output::CMSampleBuffer,
            of_type: SCStreamOutputType,
        ) {
            if of_type != SCStreamOutputType::Audio {
                return;
            }

            let allow_level_emit = {
                let mut last = self.last_emit.lock().expect("audio event mutex poisoned");
                if last.elapsed() >= Duration::from_millis(30) {
                    *last = Instant::now();
                    true
                } else {
                    false
                }
            };

            if let Ok(list) = sample_buffer.get_audio_buffer_list() {
                let mut total = 0.0f64;
                let mut buffers = 0usize;
                let mut pcm_samples: Vec<f32> = Vec::new();

                for idx in 0..list.num_buffers() {
                    if let Some(buf) = list.get(idx) {
                        let data = buf.data();
                        if data.is_empty() {
                            continue;
                        }

                        if data.len() % std::mem::size_of::<f32>() == 0 {
                            let samples: &[f32] = bytemuck::cast_slice(data);
                            if !samples.is_empty() {
                                let sum = samples
                                    .iter()
                                    .map(|v| (*v as f64) * (*v as f64))
                                    .sum::<f64>();
                                total += sum / samples.len() as f64;
                                buffers += 1;
                                pcm_samples.extend_from_slice(samples);
                            }
                        } else if data.len() % std::mem::size_of::<i16>() == 0 {
                            let samples: &[i16] = bytemuck::cast_slice(data);
                            if !samples.is_empty() {
                                let sum = samples
                                    .iter()
                                    .map(|v| {
                                        let n = *v as f64 / i16::MAX as f64;
                                        n * n
                                    })
                                    .sum::<f64>();
                                total += sum / samples.len() as f64;
                                buffers += 1;
                                pcm_samples
                                    .extend(samples.iter().map(|s| *s as f32 / i16::MAX as f32));
                            }
                        }
                    }
                }

                if buffers > 0 && allow_level_emit {
                    let rms = (total / buffers as f64).sqrt().min(1.0);
                    let _ = self.app.emit("audio-level", rms);
                }

                if !pcm_samples.is_empty() {
                    if let Some(tx) = &self.pcm_tx {
                        let _ = tx.send(pcm_samples);
                    }
                }
            }
        }
    }

    let mut stream = SCStream::new(&filter, &config);
    stream.add_output_handler(
        AudioLevelOutput {
            app: app.clone(),
            last_emit: StdMutex::new(Instant::now()),
            pcm_tx,
        },
        SCStreamOutputType::Audio,
    );

    stream.start_capture().map_err(cf_error_to_anyhow)?;
    let _ = app.emit("capture-started", ());
    let _ = stop_rx.recv();
    stream.stop_capture().ok();
    thread::sleep(Duration::from_millis(150));
    let _ = app.emit("capture-stopped", ());
    Ok(())
}

fn normalize_speaker(raw: Option<String>) -> Option<String> {
    raw.and_then(|s| {
        let trimmed = s.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn append_turn(turns: &mut Vec<TranscriptTurnPayload>, speaker: Option<String>, text: &str) {
    let speaker = normalize_speaker(speaker);
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return;
    }

    if let Some(last) = turns.last_mut() {
        if last.speaker == speaker {
            if !last.text.is_empty() && !last.text.ends_with(char::is_whitespace) {
                last.text.push(' ');
            }
            last.text.push_str(trimmed);
            return;
        }
    }

    turns.push(TranscriptTurnPayload {
        speaker,
        text: trimmed.to_string(),
    });
}

fn render_turns_to_text(turns: &[TranscriptTurnPayload]) -> String {
    let mut out = String::new();

    for (idx, turn) in turns.iter().enumerate() {
        if idx > 0 {
            out.push_str("\n\n");
        }

        if let Some(speaker) = &turn.speaker {
            out.push_str(&format!("[{}]: ", speaker));
        }

        out.push_str(&turn.text);
    }

    out
}

async fn run_transcription(
    api_key: String,
    additional_vocab: Vec<AdditionalVocabularyEntry>,
    speaker_profile: Option<SpeakerProfileArg>,
    rt_url: Option<String>,
    mut screen_rx: mpsc::UnboundedReceiver<Vec<f32>>,
    mut mic_rx: mpsc::UnboundedReceiver<Vec<f32>>,
    mut stop_rx: oneshot::Receiver<()>,
    window: Window,
    transcript_state: Arc<Mutex<String>>,
    is_muted: Arc<Mutex<bool>>,
    wake_lock_state: Arc<Mutex<Option<WakeLock>>>,
) -> Result<(), String> {
    let _wake_lock_guard = WakeLockGuard {
        wake_lock_state: wake_lock_state.clone(),
    };
    let jwt = create_jwt(api_key).await.map_err(|e| {
        eprintln!("create_jwt failed: {}", e);
        e.to_string()
    })?;
    let ws_url = build_rt_ws_url(rt_url.as_deref(), &jwt);
    let (ws_stream, _) = connect_async(&ws_url).await.map_err(|e| {
        eprintln!("connect_async failed: {}", e);
        e.to_string()
    })?;
    let (mut write, mut read) = ws_stream.split();

    let speaker_config = speaker_profile.as_ref().map(|profile| SpeakerDiarizationConfig {
        get_speakers: None,
        speakers: Some(vec![KnownSpeaker {
            label: profile.label.clone(),
            speaker_identifiers: profile.speaker_identifiers.clone(),
        }]),
    });

    let config = SpeechmaticsConfig {
        message: "StartRecognition".to_string(),
        transcription_config: TranscriptionConfig {
            language: "en".to_string(),
            enable_partials: true,
            operating_point: "enhanced".to_string(),
            max_delay: 1.5,
            diarization: Some("speaker".to_string()),
            speaker_diarization_config: speaker_config,
            additional_vocab: if additional_vocab.is_empty() {
                None
            } else {
                Some(additional_vocab)
            },
        },
        audio_format: AudioFormat {
            format_type: "raw".to_string(),
            encoding: "pcm_s16le".to_string(),
            sample_rate: TARGET_SAMPLE_RATE,
        },
    };

    if cfg!(debug_assertions) {
        match serde_json::to_string_pretty(&config) {
            Ok(pretty) => println!("Speechmatics StartRecognition config:\n{}", pretty),
            Err(err) => eprintln!("Failed to serialize config for logging: {}", err),
        }
    }

    let config_msg =
        serde_json::to_string(&config).map_err(|e| format!("Failed to encode config: {}", e))?;
    write
        .send(Message::Text(config_msg))
        .await
        .map_err(|e| format!("Failed to send config: {}", e))?;

    let read_window = window.clone();
    let mut transcript_turns: Vec<TranscriptTurnPayload> = Vec::new();
    let transcript_state_clone = transcript_state.clone();
    let read_handle = tauri::async_runtime::spawn(async move {
        while let Some(msg) = read.next().await {
            if let Ok(Message::Text(text)) = msg {
                match serde_json::from_str::<SpeechmaticsMessage>(&text) {
                    Ok(parsed) => {
                        if let Some(error) = parsed.error {
                            let _ = read_window.emit("recording-error", error);
                            continue;
                        }

                        match parsed.message.as_str() {
                            "AddPartialTranscript" => {
                                if let Some(text) = extract_text(&parsed) {
                                    if !text.trim().is_empty() {
                                        let _ = read_window.emit(
                                            "transcript-update",
                                            TranscriptUpdate {
                                                text: text.clone(),
                                                is_partial: true,
                                                turns: None,
                                            },
                                        );
                                    }
                                }
                            }
                            "AddTranscript" => {
                                let mut appended = false;

                                for result in &parsed.results {
                                    if let Some(first) = result.alternatives.first() {
                                        let speaker = first.speaker.clone();

                                        if let Some(text) = first.text() {
                                            let cleaned = text.trim();
                                            if cleaned.is_empty() {
                                                continue;
                                            }

                                            append_turn(&mut transcript_turns, speaker, cleaned);
                                            appended = true;
                                        }
                                    }
                                }

                                if !appended {
                                    if let Some(meta_text) =
                                        parsed.metadata.as_ref().and_then(|m| m.transcript.as_ref())
                                    {
                                        let cleaned = meta_text.trim();
                                        if !cleaned.is_empty() {
                                            append_turn(&mut transcript_turns, None, cleaned);
                                            appended = true;
                                        }
                                    }
                                }

                                if appended && !transcript_turns.is_empty() {
                                    let final_transcript =
                                        render_turns_to_text(&transcript_turns);

                                    {
                                        let mut transcript = transcript_state_clone.lock();
                                        *transcript = final_transcript.clone();
                                    }

                                    let _ = read_window.emit(
                                        "transcript-update",
                                        TranscriptUpdate {
                                            text: final_transcript.clone(),
                                            is_partial: false,
                                            turns: Some(transcript_turns.clone()),
                                        },
                                    );
                                }
                            }
                            "EndOfTranscript" => break,
                            _ => {}
                        }
                    }
                    Err(err) => {
                        eprintln!("Failed to parse Speechmatics message: {}", err);
                    }
                }
            }
        }
    });

    let mut screen_buf: Vec<f32> = Vec::new();
    let mut mic_buf: Vec<f32> = Vec::new();
    let mut seq_no: u32 = 0;

    loop {
        tokio::select! {
          _ = &mut stop_rx => break,
          Some(chunk) = screen_rx.recv() => {
            screen_buf.extend_from_slice(&chunk);
          },
          Some(chunk) = mic_rx.recv() => {
            mic_buf.extend_from_slice(&chunk);
          },
          else => break,
        }

        while screen_buf.len() >= MIN_BUFFER_THRESHOLD && mic_buf.len() >= MIN_BUFFER_THRESHOLD {
            if screen_buf.len() < FRAME_SIZE || mic_buf.len() < FRAME_SIZE {
                break;
            }

            let mut mixed = Vec::with_capacity(FRAME_SIZE);
            for i in 0..FRAME_SIZE {
                let s = screen_buf[i];
                let m = mic_buf[i];
                mixed.push((s + m) * 0.5);
            }

            truncate_buffer(&mut screen_buf, FRAME_SIZE);
            truncate_buffer(&mut mic_buf, FRAME_SIZE);

            let pcm = resample_to_pcm16(&mixed, SOURCE_SAMPLE_RATE, TARGET_SAMPLE_RATE);
            if *is_muted.lock() {
                seq_no += 1;
                continue;
            }

            if write.send(Message::Binary(pcm)).await.is_err() {
                eprintln!("WebSocket write failed, stopping audio processing");
                break;
            }
            seq_no += 1;
        }
    }

    tokio::time::sleep(Duration::from_millis(2500)).await;

    let end_of_stream = EndOfStreamMessage {
        message: "EndOfStream".to_string(),
        last_seq_no: seq_no,
    };

    if let Ok(payload) = serde_json::to_string(&end_of_stream) {
        let _ = write.send(Message::Text(payload)).await;
    }
    let _ = write.close().await;
    let _ = read_handle.await;
    let _ = window.emit("recording-ended", ());
    Ok(())
}

fn truncate_buffer(buffer: &mut Vec<f32>, frame: usize) {
    if buffer.len() > frame {
        buffer.drain(0..frame);
    } else {
        buffer.clear();
    }
}

fn resample_to_pcm16(samples: &[f32], source_rate: u32, target_rate: u32) -> Vec<u8> {
    if source_rate == 0 || target_rate == 0 {
        return Vec::new();
    }

    if source_rate == target_rate {
        let mut direct = Vec::with_capacity(samples.len() * 2);
        for &sample in samples {
            let clamped = (sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
            direct.extend_from_slice(&clamped.to_le_bytes());
        }
        return direct;
    }

    let ratio = source_rate as f32 / target_rate as f32;
    let out_len = (samples.len() as f32 / ratio).ceil() as usize;
    let mut output = Vec::with_capacity(out_len * 2);

    for n in 0..out_len {
        let pos = n as f32 * ratio;
        let idx = pos.floor() as usize;
        let frac = pos - idx as f32;

        let s0 = samples.get(idx).copied().unwrap_or(0.0);
        let s1 = samples.get(idx + 1).copied().unwrap_or(s0);
        let interp = s0 * (1.0 - frac) + s1 * frac;

        let clamped = (interp.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
        output.extend_from_slice(&clamped.to_le_bytes());
    }

    output
}

async fn create_jwt(api_key: String) -> Result<String, Box<dyn std::error::Error>> {
    let client = reqwest::Client::new();
    let body = serde_json::json!({ "ttl": 60 });

    let response = client
        .post("https://mp.speechmatics.com/v1/api_keys")
        .query(&[("type", "rt")])
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&body)
        .send()
        .await?;

    let status = response.status();
    let response_text = response.text().await?;

    if !status.is_success() {
        return Err(format!(
            "Failed to get JWT token. Status: {}, Response: {}",
            status, response_text
        )
        .into());
    }

    let json: serde_json::Value = serde_json::from_str(&response_text)?;
    let jwt = json["key_value"]
        .as_str()
        .ok_or("JWT token not found in response")?
        .to_string();

    Ok(jwt)
}

fn build_rt_ws_url(rt_url: Option<&str>, jwt: &str) -> String {
    let base = rt_url
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .unwrap_or(DEFAULT_RT_URL);

    if base.contains('?') {
        format!("{}&jwt={}", base, jwt)
    } else {
        format!("{}?jwt={}", base, jwt)
    }
}

#[tauri::command]
async fn enroll_speaker_rt(
    api_key: String,
    samples: Vec<f32>,
    sample_rate: u32,
    rt_url: Option<String>,
) -> Result<Vec<String>, String> {
    if samples.is_empty() {
        return Err("No samples provided".to_string());
    }

    let jwt = create_jwt(api_key)
        .await
        .map_err(|e| format!("Failed to create JWT: {}", e))?;
    let ws_url = build_rt_ws_url(rt_url.as_deref(), &jwt);
    let (ws_stream, _) = connect_async(&ws_url)
        .await
        .map_err(|e| format!("Failed to connect to Speechmatics RT: {}", e))?;
    let (mut write, mut read) = ws_stream.split();

    let config = SpeechmaticsConfig {
        message: "StartRecognition".to_string(),
        transcription_config: TranscriptionConfig {
            language: "en".to_string(),
            enable_partials: false,
            operating_point: "enhanced".to_string(),
            max_delay: 1.5,
            diarization: Some("speaker".to_string()),
            speaker_diarization_config: Some(SpeakerDiarizationConfig {
                get_speakers: Some(true),
                speakers: None,
            }),
            additional_vocab: None,
        },
        audio_format: AudioFormat {
            format_type: "raw".to_string(),
            encoding: "pcm_s16le".to_string(),
            sample_rate: TARGET_SAMPLE_RATE,
        },
    };

    let config_msg =
        serde_json::to_string(&config).map_err(|e| format!("Failed to encode config: {}", e))?;
    write
        .send(Message::Text(config_msg))
        .await
        .map_err(|e| format!("Failed to send config: {}", e))?;

    let pcm = resample_to_pcm16(&samples, sample_rate, TARGET_SAMPLE_RATE);
    let mut seq_no: u32 = 0;
    for chunk in pcm.chunks(320) {
        if write
            .send(Message::Binary(chunk.to_vec()))
            .await
            .is_err()
        {
            return Err("Failed to stream audio to Speechmatics".to_string());
        }
        seq_no += 1;
    }

    let end_of_stream = EndOfStreamMessage {
        message: "EndOfStream".to_string(),
        last_seq_no: seq_no,
    };

    if let Ok(payload) = serde_json::to_string(&end_of_stream) {
        let _ = write.send(Message::Text(payload)).await;
    }

    let mut identifiers: Vec<String> = Vec::new();
    while let Some(msg) = read.next().await {
        if let Ok(Message::Text(text)) = msg {
            if let Ok(parsed) = serde_json::from_str::<SpeakersResultMessage>(&text) {
                if parsed.message == "SpeakersResult" {
                    if let Some(entries) = parsed.speakers {
                        for entry in entries {
                            if let Some(ids) = entry.speaker_identifiers {
                                identifiers.extend(ids.into_iter().filter(|id| !id.is_empty()));
                            }
                        }
                    }
                    break;
                }

                if let Some(err) = parsed.error {
                    return Err(format!("Speechmatics error: {}", err));
                }
            }
        }
    }

    if identifiers.is_empty() {
        return Err("Speechmatics did not return any speaker identifiers.".to_string());
    }

    Ok(identifiers)
}

#[tauri::command]
async fn create_directory(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path).map_err(|e| format!("Failed to create directory: {}", e))
}

#[tauri::command]
async fn write_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| format!("Failed to write file: {}", e))
}

#[tauri::command]
async fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
async fn rename_directory(old_path: String, new_path: String) -> Result<(), String> {
    if !std::path::Path::new(&old_path).exists() {
        return Err("Source directory does not exist".to_string());
    }

    if std::path::Path::new(&new_path).exists() {
        return Err("Destination directory already exists".to_string());
    }

    std::fs::rename(&old_path, &new_path).map_err(|e| format!("Failed to rename directory: {}", e))
}

#[tauri::command]
async fn directory_exists(path: String) -> Result<bool, String> {
    Ok(std::path::Path::new(&path).exists())
}

#[tauri::command]
async fn get_home_directory() -> Result<String, String> {
    dirs::home_dir()
        .and_then(|path| path.to_str().map(|s| s.to_string()))
        .ok_or_else(|| "Failed to get home directory".to_string())
}

#[tauri::command]
async fn register_global_shortcut(app: tauri::AppHandle, shortcut: String) -> Result<(), String> {
    let shortcut_obj: Shortcut = shortcut
        .parse()
        .map_err(|e| format!("Invalid shortcut format: {:?}", e))?;

    let _ = app.global_shortcut().unregister_all();

    app.global_shortcut()
        .on_shortcut(shortcut_obj, move |app, _shortcut, _event| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
                let _ = window.emit("global-shortcut-triggered", ());
            }
        })
        .map_err(|e| format!("Failed to register shortcut: {:?}", e))?;

    Ok(())
}

#[tauri::command]
async fn unregister_global_shortcut(app: tauri::AppHandle) -> Result<(), String> {
    app.global_shortcut()
        .unregister_all()
        .map_err(|e| format!("Failed to unregister shortcuts: {:?}", e))?;
    Ok(())
}

#[tauri::command]
async fn register_mute_shortcut(app: tauri::AppHandle, shortcut: String) -> Result<(), String> {
    let shortcut_obj: Shortcut = shortcut
        .parse()
        .map_err(|e| format!("Invalid shortcut format: {:?}", e))?;

    app.global_shortcut()
        .on_shortcut(shortcut_obj, move |app, _shortcut, _event| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.emit("mute-shortcut-triggered", ());
            }
        })
        .map_err(|e| format!("Failed to register mute shortcut: {:?}", e))?;

    Ok(())
}

#[tauri::command]
async fn get_transcript(state: State<'_, AppState>) -> Result<String, String> {
    Ok(state.transcript.lock().clone())
}

#[tauri::command]
async fn save_transcript(state: State<'_, AppState>, filename: String) -> Result<String, String> {
    let transcript = state.transcript.lock().clone();

    let path = std::env::current_dir()
        .map_err(|e| e.to_string())?
        .join(&filename);

    std::fs::write(&path, transcript.as_bytes())
        .map_err(|e| format!("Failed to save file: {}", e))?;

    Ok(format!("Transcript saved to {}", path.display()))
}

#[tauri::command]
async fn start_sc_capture(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    spawn_screen_capture(app, state.capture_state.clone(), None)
}

#[tauri::command]
async fn stop_sc_capture(state: State<'_, AppState>) -> Result<(), String> {
    stop_capture(state.capture_state.clone());
    Ok(())
}

fn clean_punctuation(text: &str) -> String {
    let mut result = text.to_string();
    let punctuation = [" .", " ,", " !", " ?", " :", " ;", " '", " \""];
    for punc in &punctuation {
        result = result.replace(punc, &punc[1..]);
    }
    result
}

#[tauri::command]
async fn request_calendar_permission() -> Result<bool, String> {
    calendar::request_calendar_access()
}

#[tauri::command]
async fn check_calendar_permission() -> Result<bool, String> {
    calendar::check_calendar_access()
}

#[tauri::command]
async fn list_calendars() -> Result<Vec<calendar::Calendar>, String> {
    calendar::list_calendars()
}

#[tauri::command]
async fn fetch_calendar_events(
    calendar_ids: Vec<String>,
    start_date: String,
    end_date: String,
) -> Result<Vec<calendar::CalendarEvent>, String> {
    calendar::fetch_events(calendar_ids, start_date, end_date)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_stronghold::Builder::new(|password| password.as_bytes().to_vec()).build(),
        )
        .manage(AppState::default())
        .setup(|app| {
            setup_tray(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_recording,
            stop_recording,
            push_mic_audio_chunk,
            get_transcript,
            save_transcript,
            create_directory,
            write_file,
            read_file,
            rename_directory,
            directory_exists,
            get_home_directory,
            register_global_shortcut,
            unregister_global_shortcut,
            mute_recording,
            unmute_recording,
            toggle_mute,
            get_mute_status,
            enroll_speaker_rt,
            register_mute_shortcut,
            request_calendar_permission,
            check_calendar_permission,
            list_calendars,
            fetch_calendar_events,
            start_sc_capture,
            stop_sc_capture
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn setup_tray(app: &mut tauri::App) -> tauri::Result<()> {
    let app_handle = app.handle();

    let tray_menu = MenuBuilder::new(app_handle)
        .item(
            &MenuItemBuilder::with_id("tray-show", "Show Jilu").build(app_handle)?,
        )
        .item(
            &MenuItemBuilder::with_id("tray-new-meeting", "New Meeting")
                .build(app_handle)?,
        )
        .item(
            &MenuItemBuilder::with_id("tray-toggle-mute", "Toggle Mute")
                .build(app_handle)?,
        )
        .separator()
        .item(&MenuItemBuilder::with_id("tray-quit", "Quit").build(app_handle)?)
        .build()?;

    let mut tray_builder = TrayIconBuilder::with_id("main-tray")
        .menu(&tray_menu)
        .tooltip("Jilu")
        .on_tray_icon_event(|tray, event| match event {
            TrayIconEvent::Click { .. } => {
                show_main_window(tray.app_handle());
            }
            _ => {}
        })
        .on_menu_event(|app_handle, event| match event.id().as_ref() {
            "tray-show" => {
                show_main_window(app_handle);
            }
            "tray-new-meeting" => {
                show_main_window(app_handle);
                let _ = app_handle.emit("global-shortcut-triggered", ());
            }
            "tray-toggle-mute" => {
                let _ = app_handle.emit("mute-shortcut-triggered", ());
            }
            "tray-quit" => {
                app_handle.exit(0);
            }
            _ => {}
        });

    if let Some(icon) = app_handle.default_window_icon().cloned() {
        tray_builder = tray_builder.icon(icon);
    }

    let tray = tray_builder.build(app)?;
    app.manage(tray);

    Ok(())
}

fn show_main_window(app_handle: &AppHandle) {
    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}
