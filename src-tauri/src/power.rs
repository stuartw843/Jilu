#[cfg(target_os = "macos")]
mod platform {
    use core_foundation::base::TCFType;
    use core_foundation::string::{CFString, CFStringRef};

    type IOPMAssertionID = u32;
    type IOReturn = i32;
    type IOPMAssertionLevel = u32;

    const ASSERTION_LEVEL_ON: IOPMAssertionLevel = 255;

    #[link(name = "IOKit", kind = "framework")]
    extern "C" {
        fn IOPMAssertionCreateWithName(
            assertion_type: CFStringRef,
            assertion_level: IOPMAssertionLevel,
            assertion_name: CFStringRef,
            assertion_id: *mut IOPMAssertionID,
        ) -> IOReturn;

        fn IOPMAssertionRelease(assertion_id: IOPMAssertionID) -> IOReturn;
    }

    pub struct WakeLock {
        id: Option<IOPMAssertionID>,
    }

    impl WakeLock {
        pub fn acquire(reason: &str) -> Result<Self, String> {
            let assertion_type = CFString::new("PreventUserIdleDisplaySleep");
            let assertion_name = CFString::new(reason);
            let mut id: IOPMAssertionID = 0;

            let result = unsafe {
                IOPMAssertionCreateWithName(
                    assertion_type.as_concrete_TypeRef(),
                    ASSERTION_LEVEL_ON,
                    assertion_name.as_concrete_TypeRef(),
                    &mut id,
                )
            };

            if result == 0 {
                Ok(Self { id: Some(id) })
            } else {
                Err(format!(
                    "IOPMAssertionCreateWithName failed with code {result}"
                ))
            }
        }

        pub fn release(&mut self) {
            if let Some(id) = self.id.take() {
                unsafe {
                    let _ = IOPMAssertionRelease(id);
                }
            }
        }
    }

    impl Drop for WakeLock {
        fn drop(&mut self) {
            self.release();
        }
    }
}

#[cfg(not(target_os = "macos"))]
mod platform {
    #[derive(Default)]
    pub struct WakeLock;

    impl WakeLock {
        pub fn acquire(_reason: &str) -> Result<Self, String> {
            Ok(Self)
        }

        pub fn release(&mut self) {}
    }
}

pub use platform::WakeLock;
