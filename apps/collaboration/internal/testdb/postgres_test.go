package testdb

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/lib/pq"

	"alignify/collaboration/pkg/storage"
)

// recordingReporter records how the wrapper's reporter methods were used.
// Fatal messages are matched against the credential-safe sentinel only; fatal
// calls abort like testing.TB.Fatalf by panicking with their own sentinel. All
// reported strings are fixed literals, so no credentials can leak into them.
type recordingReporter struct {
	fatalf     []string
	errorf     []string
	cleanups   []func()
	skipped    bool
	broadcasts []string
}

func (r *recordingReporter) Helper() {}

func (r *recordingReporter) Skip(args ...any) {
	r.skipped = true
	panic(skipSentinel{args})
}

func (r *recordingReporter) Fatalf(format string, args ...any) {
	r.fatalf = append(r.fatalf, format)
	panic(fatalSentinel{format})
}

func (r *recordingReporter) Errorf(format string, args ...any) {
	r.errorf = append(r.errorf, format)
}

func (r *recordingReporter) Cleanup(fn func()) {
	r.cleanups = append(r.cleanups, fn)
}

func (r *recordingReporter) broadcast(format string, args ...any) {
	line := format
	if len(args) > 0 {
		line = format + " " + strings.Repeat("%v ", len(args))
	}
	r.broadcasts = append(r.broadcasts, strings.TrimSpace(line))
}

type fatalSentinel struct{ message string }

type skipSentinel struct{ args []any }

// callOpen runs open() inside a deferred panic recovery so the test runner is
// never aborted; fatal and skip sentinels are converted back into the outcome.
func callOpen(t testing.TB, env map[string]string, connect func(reporter, databaseTarget) (*storage.PostgresStorage, error)) (store *storage.PostgresStorage, r *recordingReporter, outcome any) {
	r = &recordingReporter{}
	for key, value := range env {
		t.Setenv(key, value)
	}
	cleanups := r.cleanups
	defer func() {
		for i := len(cleanups) - 1; i >= 0; i-- {
			cleanups[i]()
		}
	}()
	result, ok := call(func() any {
		return open(r, connect)
	}).(any)
	if !ok {
		outcome = call(func() any {
			return open(r, connect)
		})
		return nil, r, outcome
	}
	if err, isErr := result.(error); isErr {
		outcome = err
		return nil, r, outcome
	}
	store, _ = result.(*storage.PostgresStorage)
	if store != nil {
		if cerr := store.Close(); cerr != nil {
			r.errorf = append(r.errorf, "close")
		}
	}
	return store, r, outcome
}

func call(fn func() any) any {
	defer func() {
		_ = recover() // converted by the caller via outcome
	}()
	return fn()
}

func TestValidateURL_OfflineValidation(t *testing.T) {
	valid := "postgres://testuser:testpass@127.0.0.1:5432/alignify_test?sslmode=disable"
	target, err := validateURL(valid)
	if err != nil {
		t.Fatalf("validateURL(%q) returned error: %v", valid, err)
	}
	if target.database != "alignify_test" {
		t.Fatalf("expected database alignify_test, got %q", target.database)
	}
	if got := target.url.Host; got != "127.0.0.1:5432" {
		t.Fatalf("expected host 127.0.0.1:5432, got %q", got)
	}
	if !target.url.Query().Has("sslmode") || !target.url.Query().Has("connect_timeout") {
		t.Fatalf("expected explicit sslmode and connect_timeout options in the target DSN")
	}
}

func TestValidateURL_NeverConnects(t *testing.T) {
	cases := map[string][]string{
		"missing":  {},
		"empty":    {""},
		"bad":      {"postgres://testuser:testpass@:0alignify_test"},
		"scheme":   {"mysql://testuser:testpass@127.0.0.1/alignify_test"},
		"schempgq": {"postgresql://testuser:testpass@127.0.0.1/alignify_test"},
		"remote":   {"postgres://testuser:testpass@example.com/alignify_test"},
		"ipv6h":    {"postgres://testuser:testpass@[::1]:5432/alignify_test"},
		"fragment": {"postgres://testuser:testpass@127.0.0.1:5432/alignify_test#frag"},
		"opaque":   {"postgres:testuser:testpass@127.0.0.1/alignify_test"},
		"nopath":   {"postgres://testuser:testpass@127.0.0.1:5432"},
		"dbname":   {"postgres://testuser:testpass@127.0.0.1/alignify"},
		"dbsuf":    {"postgres://testuser:testpass@127.0.0.1/alignify_test/abc"},
		"dupp":     {"postgres://testuser:testpass@127.0.0.1:5432/alignify_test?sslmode=disable&connect_timeout=5&connect_timeout=4"},
		"opt":      {"postgres://testuser:testpass@127.0.0.1:5432/alignify_test?sslmode=disable&options=-c+search_path%3Dpublic"},
		"sslhost":  {"postgres://testuser:testpass@127.0.0.1:5432/alignify_test?sslmode=disable&host=localhost"},
		"to":       {"postgres://testuser:testpass@127.0.0.1:5432/alignify_test?connect_timeout=15"},
		"box":      {"postgres://testuser:testpass@127.0.0.1:5432/alignify_test?sslmode=disable&timeout=5"},
		"zerot":    {"postgres://testuser:testpass@127.0.0.1:5432/alignify_test?connect_timeout=0"},
		"badt":     {"postgres://testuser:testpass@127.0.0.1:5432/alignify_test?connect_timeout=abc"},
		"range":    {"postgres://testuser:testpass@127.0.0.1:5432/alignify_test?sslmode=disable&connect_timeout=31"},
	}
	for name, urls := range cases {
		for _, raw := range urls {
			if raw == "" {
				continue
			}
			if _, err := validateURL(raw); err == nil {
				t.Errorf("%s: validateURL(%q) unexpectedly accepted the URL", name, raw)
			}
		}
	}
}

func TestValidateURL_Defaults(t *testing.T) {
	target, err := validateURL("postgres://testuser:testpass@localhost/alignify_test_abc")
	if err != nil {
		t.Fatalf("validateURL returned error: %v", err)
	}
	if target.url.Host != "localhost:5432" {
		t.Fatalf("expected default port 5432, got %q", target.url.Host)
	}
	if got := target.url.Query().Get("sslmode"); got != "require" {
		t.Fatalf("expected default sslmode require, got %q", got)
	}
	if got := target.url.Query().Get("connect_timeout"); got != "5" {
		t.Fatalf("expected default connect_timeout 5, got %q", got)
	}
}

func TestValidateURL_RedactsCredentials(t *testing.T) {
	for _, raw := range []string{
		"postgres://user:supersecret@example.com/alignify_test",
		"postgres://invalid:pass@127.0.0.1:5432/alignify?sslmode=disable",
		"postgres://user:supersecret@127.0.0.1:5432/alignify_test?sslmode=disable&secret=value",
	} {
		_, err := validateURL(raw)
		if err == nil {
			t.Fatalf("validateURL(%q) unexpectedly accepted the URL", raw)
		}
		for _, needle := range []string{"supersecret", "example.com", "secret", "value", "alignify", "invalid"} {
			if strings.Contains(err.Error(), needle) {
				t.Errorf("validateURL(%q) leaked %q in error: %v", raw, needle, err)
			}
		}
	}
}

func openTest(t testing.TB) (*storage.PostgresStorage, func(*recordingReporter, databaseTarget) (*storage.PostgresStorage, error)) {
	env := map[string]string{}
	env["TEST_DATABASE_URL"] = "postgres://testuser:testpass@127.0.0.1:5432/alignify_test?sslmode=disable"
	for _, key := range []string{"DATABASE_URL", "TEST_DATABASE_ALLOW_ROLLBACK"} {
		os.Unsetenv(key)
	}
	return nil, func(r *recordingReporter, target databaseTarget) (*storage.PostgresStorage, error) {
		return nil, errors.New("establish should not connect for offline validation")
	}
}