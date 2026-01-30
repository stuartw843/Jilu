# Contributing to Jilu

Thank you for your interest in contributing to Jilu! We welcome contributions from the community.

## ⚠️ Important Notice

This project was primarily developed with assistance from Large Language Models (LLMs). Please be aware:

- The codebase may contain bugs, errors, or security vulnerabilities
- All contributions should include thorough testing
- Security-related changes require extra scrutiny
- Code review is essential before merging

## 🤝 How to Contribute

### Reporting Bugs

Before creating a bug report:
1. Check the [existing issues](../../issues) to avoid duplicates
2. Verify you're using the latest version
3. Test on a clean installation if possible

**Bug Report Should Include:**
- macOS version
- Jilu version
- Steps to reproduce
- Expected vs actual behavior
- Screenshots or error logs if applicable
- Console output (from Developer Tools)

### Suggesting Enhancements

Enhancement suggestions are welcome! Please:
1. Check [existing feature requests](../../issues?q=is%3Aissue+label%3Aenhancement)
2. Describe the problem your feature would solve
3. Explain your proposed solution
4. Consider alternative approaches
5. Note if you're willing to implement it

### Pull Requests

**Before Starting Major Work:**
- Open an issue to discuss your approach
- Wait for maintainer feedback
- Ensure the feature aligns with project goals

**PR Guidelines:**
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Test thoroughly (see Testing section)
5. Commit with clear messages
6. Push to your fork
7. Open a Pull Request

## 🛠️ Development Setup

### Requirements
- macOS 12+ (Monterey or later)
- Node.js 18+
- Rust 1.70+
- Xcode Command Line Tools/VScode

### Getting Started

```bash
# Clone your fork
git clone https://github.com/your-username/jilu.git
cd jilu

# Install dependencies
npm install

# Set up API keys for testing
# Create a .env.local file (not tracked by git)
# Add your test API keys

# Start development server
npm run tauri dev
```

### Project Structure

```
jilu/
├── src/                    # Frontend TypeScript code
│   ├── ai-service/        # AI integration (OpenAI, etc.)
│   ├── database/          # IndexedDB operations
│   ├── ui/                # UI components and logic
│   ├── utils/             # Shared utilities
│   └── main.ts           # Application entry point
├── src-tauri/             # Rust backend
│   └── src/
│       ├── lib.rs         # Main Tauri logic
│       ├── calendar.rs    # Calendar integration
│       └── power.rs       # Power management
├── index.html            # Main HTML file
└── package.json          # Node dependencies
```

## 💻 Coding Standards

### TypeScript/JavaScript
- Use TypeScript for type safety
- Follow existing code style
- Avoid `any` types where possible
- Add JSDoc comments for public functions
- Use meaningful variable names

### Rust
- Follow Rust conventions
- Use `cargo fmt` before committing
- Run `cargo clippy` to catch issues
- Handle errors properly (no unwrap in production code)
- Document public functions

### General
- Keep functions small and focused
- Write self-documenting code
- Comment complex logic
- Update documentation when changing behavior

## ✅ Testing

**Manual Testing Checklist:**
- [ ] App builds without errors (`npm run tauri build`)
- [ ] App runs in dev mode (`npm run tauri dev`)
- [ ] Can create a new meeting
- [ ] Recording starts and stops correctly
- [ ] Transcription appears (with valid API key)
- [ ] Can save and load meetings
- [ ] Search and filter work
- [ ] Settings can be changed and persist
- [ ] No console errors during normal use

**Test Critical Paths:**
1. **Recording Flow**: New meeting → Start recording → Transcribe → Stop → Save
2. **AI Features**: Enhance notes → Generate summary → Ask chat questions
3. **Calendar Sync**: Enable calendar → Grant permission → Sync events
4. **Task Management**: Create task → Set due date → Mark complete

**Testing with API Keys:**
- Use test API keys, not production keys
- Be mindful of API costs during testing
- Test error handling with invalid keys

## 🐛 Debugging

### Frontend Debugging
- Open Developer Tools in the app (View → Developer Tools)
- Check Console for errors
- Use `console.log()` for debugging
- Check Network tab for API calls

### Rust Debugging
- Run with logging: `RUST_LOG=debug npm run tauri dev`
- Check terminal output for Rust errors
- Use `eprintln!()` for debug output
- Use `lldb` for advanced debugging

## 📝 Commit Messages

Use clear, descriptive commit messages:

```
Good:
- "Fix: Prevent crash when stopping recording without starting"
- "Feature: Add keyboard shortcut for muting"
- "Docs: Update setup instructions for audio permissions"

Bad:
- "fix bug"
- "updates"
- "changes"
```

**Format:**
```
<type>: <short description>

<optional longer description>

<optional references to issues>
```

**Types:**
- `Fix:` - Bug fixes
- `Feature:` - New features
- `Docs:` - Documentation changes
- `Refactor:` - Code refactoring
- `Test:` - Adding or updating tests
- `Chore:` - Maintenance tasks

## 🔒 Security

**Reporting Security Issues:**
- **DO NOT** create public issues for security vulnerabilities
- Email security concerns to: [security-email@example.com]
- Include detailed information about the vulnerability
- Allow time for a fix before public disclosure

**Security Considerations:**
- API keys are stored in localStorage (known limitation)
- Audio data is sent to Speechmatics for transcription
- AI requests are sent to OpenAI (or local LLM)
- All meeting data stays local on device
- No telemetry or tracking

**When Contributing:**
- Never commit API keys or secrets
- Validate user input to prevent XSS
- Use `escapeHtml()` utility for user-generated content
- Be cautious with external data sources

## 📋 Review Process

**What to Expect:**
1. **Initial Review** (1-3 days): Maintainer will review your PR
2. **Feedback**: You may be asked to make changes
3. **Testing**: Changes will be tested manually
4. **Merge**: Once approved, PR will be merged

**PR May Be Rejected If:**
- Changes are out of scope for the project
- Code quality doesn't meet standards
- Tests are insufficient
- Breaks existing functionality
- Security concerns are present

## 🎨 UI/UX Contributions

When contributing UI changes:
- Maintain dark mode consistency
- Follow existing design patterns
- Ensure accessibility (keyboard navigation, screen readers)
- Test on different macOS versions if possible
- Consider user experience and intuitive workflows

## 📚 Documentation

Documentation improvements are always welcome:
- Fix typos or unclear explanations
- Add missing setup instructions
- Update outdated information
- Add screenshots or examples
- Translate to other languages (future)

## 🏗️ Roadmap & Priorities

Current priorities:
1. **Stability** - Fix bugs and crashes
2. **Error Handling** - Better user feedback
3. **Documentation** - Improve setup and troubleshooting
4. **Performance** - Optimize for long meetings

See [README.md](README.md#-roadmap) for full roadmap.

## 💬 Community

- **Discussions**: Use [GitHub Discussions](../../discussions) for questions
- **Issues**: Use [GitHub Issues](../../issues) for bugs and features
- **Be Respectful**: Follow the Code of Conduct (coming soon)

## 📄 License

By contributing, you agree that your contributions will be licensed under the MIT License.

## 🙏 Thank You

Every contribution helps make Jilu better. Whether you're fixing a typo, reporting a bug, or adding a major feature - thank you for your time and effort!

---

**Questions?** Feel free to ask in [Discussions](../../discussions) or open an issue.
