use chrono::{DateTime, FixedOffset, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Calendar {
    pub id: String,
    pub title: String,
    pub color: String,
    pub source_title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalendarAttendee {
    pub name: Option<String>,
    pub email: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalendarEvent {
    pub id: String,
    pub series_id: String,
    pub title: String,
    pub start_time: String, // ISO 8601 timestamp
    pub end_time: String,   // ISO 8601 timestamp
    pub attendees: Vec<CalendarAttendee>,
    pub notes: String,
    pub location: String,
    pub calendar_id: String,
    pub calendar_name: String,
}

#[cfg(target_os = "macos")]
mod macos_impl {
    #![allow(unexpected_cfgs)] // objc macros probe cfg(feature = "cargo-clippy"), which triggers this lint

    use super::*;
    use block::ConcreteBlock;
    use cocoa::base::{id, nil, BOOL, YES};
    use objc::{class, msg_send, sel, sel_impl};
    use std::collections::HashSet;
    use std::ffi::CStr;
    use std::os::raw::c_char;
    use std::sync::mpsc::channel;

    const EK_ENTITY_TYPE_EVENT: usize = 0;
    const EK_AUTH_STATUS_NOT_DETERMINED: i64 = 0;
    const EK_AUTH_STATUS_RESTRICTED: i64 = 1;
    const EK_AUTH_STATUS_DENIED: i64 = 2;
    const EK_AUTH_STATUS_AUTHORIZED: i64 = 3;
    const EK_AUTH_STATUS_WRITE_ONLY: i64 = 4;
    const EK_AUTH_STATUS_FULL_ACCESS: i64 = 5;

    pub fn request_calendar_access() -> Result<bool, String> {
        unsafe {
            let pool: id = msg_send![class!(NSAutoreleasePool), new];
            let event_store = create_event_store()?;
            let status = authorization_status();

            match status {
                s if is_authorized_status(s) => {
                    let _: () = msg_send![pool, drain];
                    return Ok(true);
                }
                EK_AUTH_STATUS_DENIED | EK_AUTH_STATUS_RESTRICTED | EK_AUTH_STATUS_WRITE_ONLY => {
                    let _: () = msg_send![pool, drain];
                    return Ok(false);
                }
                EK_AUTH_STATUS_NOT_DETERMINED => { /* fall through to async request */ }
                _ => {}
            }

            let (tx, rx) = channel::<Result<bool, String>>();
            let block = ConcreteBlock::new(move |granted: BOOL, error: id| {
                if granted == YES {
                    let _ = tx.send(Ok(true));
                } else if error != nil {
                    let err = error_to_string(error);
                    let _ = tx.send(Err(err));
                } else {
                    let _ = tx.send(Ok(false));
                }
            })
            .copy();

            let _: () = msg_send![event_store, requestAccessToEntityType:EK_ENTITY_TYPE_EVENT completion:&*block];

            let result = rx
                .recv()
                .map_err(|_| "Failed to receive calendar permission result".to_string())?;

            let _: () = msg_send![pool, drain];
            result
        }
    }

    pub fn check_calendar_access() -> Result<bool, String> {
        Ok(is_authorized_status(authorization_status()))
    }

    pub fn list_calendars() -> Result<Vec<Calendar>, String> {
        if !check_calendar_access()? {
            return Err("Calendar permission not granted".to_string());
        }

        unsafe {
            let pool: id = msg_send![class!(NSAutoreleasePool), new];
            let event_store = create_event_store()?;
            let calendars_array: id =
                msg_send![event_store, calendarsForEntityType:EK_ENTITY_TYPE_EVENT];
            let count: usize = msg_send![calendars_array, count];
            let mut calendars = Vec::with_capacity(count);

            for idx in 0..count {
                let calendar: id = msg_send![calendars_array, objectAtIndex: idx];
                let identifier = nsstring_to_string(msg_send![calendar, calendarIdentifier]);
                let title = nsstring_to_string(msg_send![calendar, title]);
                let source: id = msg_send![calendar, source];
                let source_title = if source != nil {
                    nsstring_to_string(msg_send![source, title])
                } else {
                    "Unknown".to_string()
                };

                calendars.push(Calendar {
                    id: identifier.clone(),
                    title,
                    color: generate_color_for_calendar(&identifier),
                    source_title,
                });
            }

            let _: () = msg_send![pool, drain];
            Ok(calendars)
        }
    }

    pub fn fetch_events(
        calendar_ids: Vec<String>,
        start_date: String,
        end_date: String,
    ) -> Result<Vec<CalendarEvent>, String> {
        if calendar_ids.is_empty() {
            return Ok(Vec::new());
        }

        if !check_calendar_access()? {
            return Err("Calendar permission not granted".to_string());
        }

        let start_dt = DateTime::parse_from_rfc3339(&start_date)
            .map_err(|e| format!("Invalid start date: {}", e))?;
        let end_dt = DateTime::parse_from_rfc3339(&end_date)
            .map_err(|e| format!("Invalid end date: {}", e))?;

        unsafe {
            let pool: id = msg_send![class!(NSAutoreleasePool), new];
            let event_store = create_event_store()?;
            let (calendar_array, matched) = build_calendar_array(event_store, &calendar_ids);

            if matched == 0 {
                let _: () = msg_send![pool, drain];
                return Ok(Vec::new());
            }

            let start_ns_date = datetime_to_nsdate(&start_dt)?;
            let end_ns_date = datetime_to_nsdate(&end_dt)?;

            let predicate: id = msg_send![event_store,
                predicateForEventsWithStartDate: start_ns_date
                endDate: end_ns_date
                calendars: calendar_array
            ];

            if predicate == nil {
                let _: () = msg_send![pool, drain];
                return Err("Failed to build Calendar predicate".to_string());
            }

            let events_array: id = msg_send![event_store, eventsMatchingPredicate: predicate];
            if events_array == nil {
                let _: () = msg_send![pool, drain];
                return Ok(Vec::new());
            }

            let count: usize = msg_send![events_array, count];
            let mut events = Vec::with_capacity(count);

            for idx in 0..count {
                let event: id = msg_send![events_array, objectAtIndex: idx];
                if event == nil {
                    continue;
                }

                let all_day: BOOL = msg_send![event, isAllDay];
                if all_day == YES {
                    continue;
                }

                let start_ns: id = msg_send![event, startDate];
                let end_ns: id = msg_send![event, endDate];
                if start_ns == nil || end_ns == nil {
                    continue;
                }

                let calendar: id = msg_send![event, calendar];
                let calendar_identifier = if calendar != nil {
                    nsstring_to_string(msg_send![calendar, calendarIdentifier])
                } else {
                    String::new()
                };
                let calendar_name = if calendar != nil {
                    nsstring_to_string(msg_send![calendar, title])
                } else {
                    String::new()
                };

                let event_id = nsstring_to_string(msg_send![event, eventIdentifier]);
                let title = nsstring_to_string(msg_send![event, title]);
                let location = nsstring_to_string(msg_send![event, location]);
                let notes = nsstring_to_string(msg_send![event, notes]);
                let attendees = collect_attendees(event);

                let start_iso = nsdate_to_iso_string(start_ns)?;
                let end_iso = nsdate_to_iso_string(end_ns)?;
                let series_id = if event_id.is_empty() {
                    if calendar_identifier.is_empty() {
                        format!("event-{}", start_iso)
                    } else {
                        format!("{}-{}", calendar_identifier, start_iso)
                    }
                } else {
                    event_id
                };
                let unique_id = format!("{}::{}", series_id, start_iso);

                events.push(CalendarEvent {
                    id: unique_id,
                    series_id,
                    title,
                    start_time: start_iso,
                    end_time: end_iso,
                    attendees,
                    notes,
                    location,
                    calendar_id: calendar_identifier.clone(),
                    calendar_name,
                });
            }

            let _: () = msg_send![pool, drain];
            Ok(events)
        }
    }

    fn authorization_status() -> i64 {
        unsafe {
            msg_send![class!(EKEventStore), authorizationStatusForEntityType:EK_ENTITY_TYPE_EVENT]
        }
    }

    fn is_authorized_status(status: i64) -> bool {
        matches!(
            status,
            EK_AUTH_STATUS_AUTHORIZED | EK_AUTH_STATUS_FULL_ACCESS
        )
    }

    unsafe fn create_event_store() -> Result<id, String> {
        let event_store: id = msg_send![class!(EKEventStore), alloc];
        let event_store: id = msg_send![event_store, init];
        if event_store == nil {
            Err("Failed to initialize EKEventStore".to_string())
        } else {
            Ok(event_store)
        }
    }

    fn nsstring_to_string(ns: id) -> String {
        if ns == nil {
            return String::new();
        }

        unsafe {
            let bytes: *const c_char = msg_send![ns, UTF8String];
            if bytes.is_null() {
                String::new()
            } else {
                CStr::from_ptr(bytes).to_string_lossy().into_owned()
            }
        }
    }

    fn error_to_string(error: id) -> String {
        if error == nil {
            return "Unknown calendar error".to_string();
        }

        unsafe {
            let description: id = msg_send![error, localizedDescription];
            let message = nsstring_to_string(description);
            if message.is_empty() {
                "Unknown calendar error".to_string()
            } else {
                message
            }
        }
    }

    fn datetime_to_nsdate(dt: &DateTime<FixedOffset>) -> Result<id, String> {
        unsafe {
            let seconds =
                dt.timestamp() as f64 + f64::from(dt.timestamp_subsec_nanos()) / 1_000_000_000_f64;
            let date: id = msg_send![class!(NSDate), dateWithTimeIntervalSince1970: seconds];
            if date == nil {
                Err("Failed to construct NSDate".to_string())
            } else {
                Ok(date)
            }
        }
    }

    fn nsdate_to_iso_string(date: id) -> Result<String, String> {
        if date == nil {
            return Err("Missing date value from Calendar event".to_string());
        }

        unsafe {
            let timestamp: f64 = msg_send![date, timeIntervalSince1970];
            let seconds = timestamp.floor();
            let mut fractional = ((timestamp - seconds) * 1_000_000_000_f64).round() as i64;
            let mut whole = seconds as i64;

            if fractional < 0 {
                whole -= 1;
                fractional += 1_000_000_000;
            }

            let nanos = fractional as u32;
            let datetime = DateTime::<Utc>::from_timestamp(whole, nanos)
                .ok_or_else(|| "Failed to convert NSDate to timestamp".to_string())?;
            Ok(datetime.to_rfc3339())
        }
    }

    fn collect_attendees(event: id) -> Vec<CalendarAttendee> {
        unsafe {
            let attendees: id = msg_send![event, attendees];
            if attendees == nil {
                return Vec::new();
            }

            let count: usize = msg_send![attendees, count];
            let mut collected = Vec::with_capacity(count);
            for idx in 0..count {
                let attendee: id = msg_send![attendees, objectAtIndex: idx];
                let name = nsstring_to_string(msg_send![attendee, name]);
                let email = nsstring_to_string(msg_send![attendee, emailAddress]);

                if name.is_empty() && email.is_empty() {
                    continue;
                }

                collected.push(CalendarAttendee {
                    name: if name.is_empty() { None } else { Some(name) },
                    email: if email.is_empty() { None } else { Some(email) },
                });
            }
            collected
        }
    }

    fn build_calendar_array(event_store: id, requested: &[String]) -> (id, usize) {
        unsafe {
            let trimmed: HashSet<String> = requested
                .iter()
                .map(|value| value.trim().to_string())
                .collect();

            let array: id = msg_send![class!(NSMutableArray), array];
            if trimmed.is_empty() {
                return (array, 0);
            }

            let calendars: id = msg_send![event_store, calendarsForEntityType:EK_ENTITY_TYPE_EVENT];
            let count: usize = msg_send![calendars, count];
            let mut matched = 0usize;

            for idx in 0..count {
                let calendar: id = msg_send![calendars, objectAtIndex: idx];
                let identifier = nsstring_to_string(msg_send![calendar, calendarIdentifier]);
                let title = nsstring_to_string(msg_send![calendar, title]);

                if trimmed.contains(&identifier) || trimmed.contains(&title) {
                    let _: () = msg_send![array, addObject: calendar];
                    matched += 1;
                }
            }

            (array, matched)
        }
    }

    fn generate_color_for_calendar(name: &str) -> String {
        let hash: u32 = name.chars().map(|c| c as u32).sum();
        let colors = [
            "#EF4444", "#F59E0B", "#10B981", "#3B82F6", "#6366F1", "#8B5CF6", "#EC4899", "#14B8A6",
        ];
        colors[(hash as usize) % colors.len()].to_string()
    }
}

#[cfg(target_os = "macos")]
pub use macos_impl::*;

#[cfg(not(target_os = "macos"))]
pub fn request_calendar_access() -> Result<bool, String> {
    Err("Calendar access is only available on macOS".to_string())
}

#[cfg(not(target_os = "macos"))]
pub fn check_calendar_access() -> Result<bool, String> {
    Err("Calendar access is only available on macOS".to_string())
}

#[cfg(not(target_os = "macos"))]
pub fn list_calendars() -> Result<Vec<Calendar>, String> {
    Err("Calendar access is only available on macOS".to_string())
}

#[cfg(not(target_os = "macos"))]
pub fn fetch_events(
    _calendar_ids: Vec<String>,
    _start_date: String,
    _end_date: String,
) -> Result<Vec<CalendarEvent>, String> {
    Err("Calendar access is only available on macOS".to_string())
}
