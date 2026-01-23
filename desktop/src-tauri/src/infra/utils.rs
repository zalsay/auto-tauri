//! Utility functions for the infra module.
//!
//! Provides common helpers for output processing and sanitization.

use std::borrow::Cow;

/// Strip ANSI escape codes from a string.
///
/// ANSI codes are used for terminal colors and formatting.
/// This function removes them for clean display in web UI.
pub fn strip_ansi_codes(text: &str) -> Cow<'_, str> {
    // ANSI escape sequence pattern: ESC [ ... m (and other variants)
    // ESC is \x1b (27 decimal)
    
    if !text.contains('\x1b') {
        return Cow::Borrowed(text);
    }
    
    let mut result = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    
    while let Some(c) = chars.next() {
        if c == '\x1b' {
            // Skip the escape sequence
            if let Some(&next) = chars.peek() {
                if next == '[' {
                    chars.next(); // consume '['
                    // Skip until we find the terminating character (letter)
                    while let Some(&seq_char) = chars.peek() {
                        chars.next();
                        if seq_char.is_ascii_alphabetic() {
                            break;
                        }
                    }
                } else if next == ']' {
                    chars.next(); // consume ']'
                    // OSC sequence - skip until BEL (\x07) or ST (\x1b\\)
                    while let Some(seq_char) = chars.next() {
                        if seq_char == '\x07' {
                            break;
                        }
                        if seq_char == '\x1b' {
                            if chars.peek() == Some(&'\\') {
                                chars.next();
                                break;
                            }
                        }
                    }
                }
            }
        } else {
            result.push(c);
        }
    }
    
    Cow::Owned(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_strip_ansi_codes_no_codes() {
        let text = "Hello, World!";
        assert_eq!(strip_ansi_codes(text), text);
    }

    #[test]
    fn test_strip_ansi_codes_simple_color() {
        let text = "\x1b[31mRed Text\x1b[0m";
        assert_eq!(strip_ansi_codes(text), "Red Text");
    }

    #[test]
    fn test_strip_ansi_codes_multiple() {
        let text = "\x1b[1m\x1b[32mBold Green\x1b[0m Normal";
        assert_eq!(strip_ansi_codes(text), "Bold Green Normal");
    }

    #[test]
    fn test_strip_ansi_codes_complex() {
        let text = "\x1b[38;5;196mExtended Color\x1b[0m";
        assert_eq!(strip_ansi_codes(text), "Extended Color");
    }
}
