# Pull Request

## Description

Brief description of the changes made and the motivation behind them.

Fixes #(issue_number) <!-- If this PR fixes an issue, link it here -->

## Type of Change

Please check the type of change your PR introduces:

- [ ] 🐛 **Bug fix** (non-breaking change which fixes an issue)
- [ ] ✨ **New feature** (non-breaking change which adds functionality)
- [ ] 💥 **Breaking change** (fix or feature that would cause existing functionality to not work as expected)
- [ ] 📚 **Documentation update** (improvements to README, examples, or code comments)
- [ ] 🧪 **Test improvements** (adding missing tests or correcting existing tests)
- [ ] 🎨 **Code style/formatting** (changes that do not affect the meaning of the code)
- [ ] ♻️ **Refactoring** (code change that neither fixes a bug nor adds a feature)
- [ ] ⚡ **Performance improvements** (code changes that improve performance)
- [ ] 🔧 **Build/CI changes** (changes to build process or CI configuration)

## What's Changed

### Added
- List new features or functionality added

### Changed  
- List existing functionality that was modified

### Fixed
- List bugs or issues that were resolved

### Removed
- List any features or functionality that was removed

## How Has This Been Tested?

Please describe the tests that you ran to verify your changes:

- [ ] Unit tests pass (`npm test`)
- [ ] Integration tests pass
- [ ] Manual testing performed
- [ ] Cross-platform testing (Windows/macOS/Linux)
- [ ] Performance impact assessed

**Test Configuration:**
- OS: [e.g. Windows 11, macOS 13, Ubuntu 22.04]
- Node.js version: [e.g. 18.17.0, 20.5.0]
- npm version: [e.g. 9.8.1]

**Test Details:**
```bash
# Commands used for testing
npm test
npm run test:coverage
npm run typecheck
npm run lint
```

## Breaking Changes

<!-- If this is a breaking change, list what breaks and how users should update their code -->

- [ ] This PR contains **no breaking changes**
- [ ] This PR contains **breaking changes** (detailed below)

### Migration Guide

If this introduces breaking changes, provide a migration guide:

```javascript
// Before (old way)
// ... old code example

// After (new way) 
// ... new code example
```

## Screenshots/Recordings

<!-- If applicable, add screenshots or recordings to help explain your changes -->

## Documentation

- [ ] Documentation has been updated to reflect changes
- [ ] Examples have been added or updated
- [ ] API documentation (JSDoc) has been updated
- [ ] CHANGELOG.md has been updated

## Checklist

Before submitting this PR, please make sure:

### Code Quality
- [ ] My code follows the style guidelines of this project
- [ ] I have performed a self-review of my own code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes

### Functionality
- [ ] The code compiles without errors
- [ ] All existing tests pass
- [ ] New functionality is covered by tests
- [ ] Performance impact has been considered
- [ ] Cross-platform compatibility maintained

### Documentation
- [ ] README.md updated if needed
- [ ] Examples updated if needed  
- [ ] JSDoc comments added/updated
- [ ] CHANGELOG.md updated with changes

### Dependencies
- [ ] No new dependencies added (zero-dependency policy maintained)
- [ ] If dependencies were added, they are justified and documented
- [ ] Package.json updated appropriately

## Additional Notes

Add any additional notes, context, or screenshots that would help reviewers understand your changes.

### Related Issues

- Closes #issue_number
- Related to #issue_number

### Future Considerations

- Any follow-up work needed?
- Any potential improvements identified?
- Any technical debt introduced or removed?

---

## For Maintainers

### Review Checklist

- [ ] Code follows project conventions
- [ ] All tests pass in CI
- [ ] Documentation is complete and accurate
- [ ] Breaking changes are properly documented
- [ ] Performance impact is acceptable
- [ ] Security implications considered
- [ ] Ready to merge

### Release Notes

Brief note for release notes (if applicable):

```
- Added: [description]
- Fixed: [description]
- Changed: [description]
```