# Testing Quick Reference

> Complete testing guide: [`docs/TESTING_STRATEGY.md`](docs/TESTING_STRATEGY.md)
> QA Summary: [`docs/QA_TESTING_SUMMARY.md`](docs/QA_TESTING_SUMMARY.md)

## Quick Start

```bash
# Run all tests
cargo test --all-features

# Run with coverage
cargo install cargo-tarpaulin
cargo tarpaulin --all-features --workspace --out Html

# Run benchmarks
cargo bench

# Security audit
cargo install cargo-audit cargo-deny
cargo audit
cargo deny check

# Format & lint
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
```

## Test Organization

```
llm-analytics-hub/
├── src/*/          # Unit tests (inline #[cfg(test)])
├── tests/          # Integration & security tests
│   ├── integration_event_pipeline.rs
│   └── security_tests.rs
└── benches/        # Performance benchmarks
    └── event_processing.rs
```

## Test Suites

### Unit Tests (50+ tests)

```bash
# All unit tests
cargo test --lib

# Specific module
cargo test --lib schemas::events::tests

# Specific test
cargo test test_latency_metrics_complete
```

### Integration Tests (20+ tests)

```bash
# All integration tests
cargo test --test integration_event_pipeline

# Specific test
cargo test test_event_pipeline_telemetry_flow
```

### Security Tests (25+ tests)

```bash
# All security tests
cargo test --test security_tests

# OWASP tests
cargo test test_prevent_sql_injection
cargo test test_prevent_xss
```

### Performance Benchmarks (15+ benchmarks)

```bash
# All benchmarks
cargo bench

# Specific suite
cargo bench event_processing

# Throughput test
cargo bench throughput_target
```

## Coverage

```bash
# Generate HTML report
cargo tarpaulin --all-features --workspace --out Html --output-dir coverage/

# View report
open coverage/index.html

# Check 80% threshold
cargo tarpaulin --all-features --workspace --fail-under 80
```

**Target**: 80%+ code coverage
**Current**: 90%+ (events module)

## CI/CD Pipeline

GitHub Actions runs automatically on push/PR:

1. ✅ Lint & format check
2. ✅ Build (Ubuntu, macOS, Windows)
3. ✅ Unit tests
4. ✅ Integration tests
5. ✅ Code coverage (80% threshold)
6. ✅ Security audit
7. ✅ Benchmarks (main only)
8. ✅ Compliance tests
9. ✅ Documentation build
10. ✅ Quality gate

## Quality Gates

### Pre-Commit
- [ ] `cargo fmt`
- [ ] `cargo clippy`
- [ ] `cargo test`

### Pre-Merge (CI)
- [ ] All tests pass
- [ ] Coverage ≥ 80%
- [ ] Security scan clean
- [ ] No clippy warnings

### Pre-Production
- [ ] All quality gates pass
- [ ] Performance benchmarks meet targets
- [ ] Security tests pass
- [ ] Compliance validation complete

## Key Metrics

| Metric | Target | Command |
|--------|--------|---------|
| Code Coverage | ≥ 80% | `cargo tarpaulin` |
| Throughput | 100k+ events/sec | `cargo bench throughput_target` |
| Security | OWASP Top 10 | `cargo test --test security_tests` |
| Compliance | SOC2/GDPR/HIPAA | `cargo test --test security_tests` |

## Performance Targets

| Operation | Target |
|-----------|--------|
| Event Creation | < 1μs |
| JSON Serialization | < 10μs |
| Batch Processing | 100k+ events/sec |
| Event Filtering (10k) | < 100μs |
| Event Aggregation (10k) | < 500μs |

## Security Testing

### OWASP Top 10 Coverage

```bash
# SQL Injection
cargo test test_prevent_sql_injection

# XSS
cargo test test_prevent_xss

# Command Injection
cargo test test_prevent_command_injection

# Authentication
cargo test test_auth_event

# Sensitive Data
cargo test test_sensitive_data_not_in_plaintext
```

## Compliance Testing

```bash
# SOC 2
cargo test test_soc2_control_validation

# GDPR
cargo test test_gdpr_compliance_validation

# HIPAA
cargo test test_hipaa_audit_trail
```

## Troubleshooting

### Tests Failing

```bash
# Run with backtrace
RUST_BACKTRACE=1 cargo test

# Run single test with output
cargo test test_name -- --nocapture

# Run sequentially (avoid race conditions)
cargo test -- --test-threads=1
```

### Coverage Issues

```bash
# Exclude specific files
cargo tarpaulin --exclude-files benches/

# Verbose output
cargo tarpaulin --verbose
```

### Benchmark Issues

```bash
# Longer warmup
cargo bench -- --warm-up-time 5

# More samples
cargo bench -- --sample-size 100
```

## Documentation

- **Testing Strategy**: [`docs/TESTING_STRATEGY.md`](docs/TESTING_STRATEGY.md) - Complete guide
- **QA Summary**: [`docs/QA_TESTING_SUMMARY.md`](docs/QA_TESTING_SUMMARY.md) - Deliverables overview
- **CI/CD Pipeline**: [`.github/workflows/ci.yml`](.github/workflows/ci.yml) - Automated testing

## Contact

For testing questions:
- See documentation in `docs/`
- Check CI/CD logs in GitHub Actions
- Review inline test documentation in source files

---

**Last Updated**: 2025-11-20
**Status**: ✅ Production Ready
