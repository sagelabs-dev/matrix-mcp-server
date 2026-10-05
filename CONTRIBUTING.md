# Contributing

Contributions are welcome! This project follows standard open-source contribution practices.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/<your-username>/matrix-mcp-server.git`
3. Install dependencies: `npm install`
4. Run tests: `npm test`

## Development Workflow

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make your changes
3. Ensure all tests pass: `npm test`
4. Ensure linting passes: `npm run lint`
5. Ensure formatting is clean: `npm run format:check`
6. Commit with a clear message (conventional commits preferred)
7. Push and open a Pull Request

## Code Style

- **ESM modules** (`import`/`export`, not `require`)
- **JSDoc** on all exported functions and classes
- **Composition-Root IoC** — modules don't cross-import. `index.js` wires dependencies.
- **Error handling** — use `withErrorHandling` wrapper for tool handlers
- **Tests** — every module has a corresponding unit test file

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new tool for forwarding messages
fix: resolve race condition in DM room creation
docs: update README with configuration examples
refactor: simplify alias lookup logic
test: add edge case tests for resolver
chore: bump dependencies
```

## Reporting Issues

- Use [GitHub Issues](https://github.com/sagelabs-dev/matrix-mcp-server/issues)
- Include Node.js version, OS, and steps to reproduce
- For security issues, do NOT open a public issue — contact the maintainer directly

## Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR
- Include tests for new functionality
- Update documentation if behavior changes
- Ensure CI passes before requesting review
