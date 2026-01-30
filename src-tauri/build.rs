fn main() {
    tauri_build::build();

    // Link EventKit framework on macOS
    #[cfg(target_os = "macos")]
    {
        println!("cargo:rustc-link-lib=framework=EventKit");
        println!("cargo:rustc-link-lib=framework=Foundation");

        // Ensure Info.plist is watched for changes
        println!("cargo:rerun-if-changed=Info.plist");
    }
}
