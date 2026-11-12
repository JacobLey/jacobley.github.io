---
title: "One library, several languages, held to one set of test vectors"
description: "genever, populate-files and generated-signature now have Go implementations. Each port runs expected values the TypeScript implementation computed once, including which error a bad schema fails with and where."
date: 2026-11-12
packages: [genever, populate-files, generated-signature]
---

# One library, several languages, held to one set of test vectors

<PostHeader />

[genever](https://jacobley.github.io/leyman/packages/genever/) generates TypeScript types from JSON Schema and OpenAPI documents. Since November 8 it also has a Go version, released as v0.1.0:

```sh
go get -tool github.com/JacobLey/leyman/apps/genever/go/cmd/genever@v0.1.0
```

It reads the same schemas, has the same strict mode, and rejects the same bad schemas with the same kind of error at the same JSON Pointer. It writes Go structs instead of TypeScript types. Two of genever's dependencies came along, because the Go command has to sign its output and keep a manifest the way the TypeScript one does: [populate-files](https://jacobley.github.io/leyman/packages/populate-files/) and [generated-signature](https://jacobley.github.io/leyman/packages/generated-signature/) are Go modules now too, released at the same version.

This continues a pattern in my adoption of Go, which forces language-agnostic support for common functionality (in this case, type-ifying JSON Schema + OpenAPI).

None of the Go code is tested against the TypeScript code. Both are tested against a set of test vectors: inputs and expected outputs, as JSON, that the TypeScript implementation computed once and that are committed to the repository.

## One directory per package, one per language

Each of these packages is a directory named after the package, with one project per language beside the vectors they share:

```
apps/genever/
├── README.md        what every implementation promises
├── ts/              published to npm as genever
├── go/              the Go module github.com/JacobLey/leyman/apps/genever/go
└── test-vectors/    schemas, sample values and error cases, as JSON
```

[populate-files](https://github.com/JacobLey/leyman/tree/main/apps/populate-files) and [generated-signature](https://github.com/JacobLey/leyman/tree/main/tools/generated-signature) have the same shape. [constant-consistent-hash](https://github.com/JacobLey/leyman/tree/main/tools/constant-consistent-hash), the oldest of the four, has `ts/`, `go/`, `rust/`, and a `wasm/` package that calls the Rust implementation from TypeScript.

Until the release, the TypeScript package was the root and the Go code lived in a `go-impl/` folder next to it. Moving each language into its own directory means neither is the package. The group README describes what holds in every language (the format a file is signed in, which schemas are rejected and where), and a third language has an obvious place to go.

## Where the expected values come from

genever's vectors are a [TypeScript package](https://github.com/JacobLey/leyman/tree/main/apps/genever/test-vectors) that writes JSON files under `out/` on every build:

- 45 schema fixtures, each with sample values it accepts. The schemas are [Juniper](https://jacobley.github.io/leyman/packages/juniper/) definitions and the samples come from juniper-arbitrary with a fixed seed, so a file only changes when a fixture does.
- Two OpenAPI documents, 3.0.3 and 3.1.0, with samples of each component.
- `errors.json`: 74 schemas genever rejects, each with the kind of error and the JSON Pointer it must name.

The files are committed, and CI fails if one is stale. The TypeScript genever runs the vectors from the package; the Go one reads the JSON by relative path:

```go
func testVectors() fs.FS {
	return os.DirFS(filepath.Join("..", "test-vectors"))
}
```

Reading by path was a late change. The vectors started as a Go module that embedded the JSON, which works until you release: a published Go module can't require one that isn't published, and the vectors are only for tests. So the Go tests read the working copy, and the Go project lists the vectors in its Nx `implicitDependencies` so its tests rerun when they change ([commit](https://github.com/JacobLey/leyman/commit/6a6fe44e)).

generated-signature has 187 cases in [one file](https://github.com/JacobLey/leyman/blob/main/tools/generated-signature/test-vectors/data/test-vectors.json) (signing, verifying, manual sections, manifests), and populate-files has 71 scenarios: files written, hand edits made, then one call with the results, error and files it must leave behind.

No implementation regenerates the values it is tested against: if the Go port could rewrite them, a change in Go would update the vectors and pass.

## The same error, at the same pointer

genever's error cases are vectors too. One per kind, from [`errors.json`](https://github.com/JacobLey/leyman/blob/main/apps/genever/test-vectors/out/errors.json):

```json
{
    "invalid": {
        "type is unknown": { "schema": { "type": "date" }, "pointer": "#/type" }
    },
    "strict": {
        "unknown keyword": { "schema": { "type": "string", "foo": 1 }, "pointer": "#/foo" }
    },
    "unsupported": {
        "$dynamicRef": { "options": { "strict": false }, "schema": { "$dynamicRef": "#node" }, "pointer": "#/$dynamicRef" }
    }
}
```

The [Go test](https://github.com/JacobLey/leyman/blob/main/apps/genever/go/errors_test.go) checks the error's kind with `errors.Is` and its pointer, and that each strict mode case is accepted once strict mode is off:

```go
var geneverErr *genever.Error
if !errors.Is(err, kind) || !errors.As(err, &geneverErr) || geneverErr.Pointer != item.Pointer {
	t.Fatalf("got %v, expected %s at %s", err, kind, item.Pointer)
}
```

Moving the cases out of the TypeScript tests made those tests stricter too. They had checked the error's class but not the pointer. And the whole suite had run as OpenAPI 3.0, which hid that one check (`exclusiveMaximum`) behaved differently outside it; now only the two cases that need OpenAPI 3.0 run as it ([commit](https://github.com/JacobLey/leyman/commit/b6fd7cf3)).

## What the vectors caught

generated-signature's vectors cover the places where Go and JavaScript disagree by default: what JavaScript's `\s` and `trim()` count as whitespace, Node.js's `extname`, lowercase `İ`, the byte order mark `TextDecoder` drops, and `JSON.stringify`'s escaping. One case lists five manifest keys, `Z`, `a`, `é`, `😀` and `￿`, in that order. JavaScript compares strings by UTF-16 code unit, so the emoji (a surrogate pair starting at `0xD83D`) sorts before `￿`. Go compares UTF-8 bytes, where `￿` comes first. A manifest written by one would look edited to the other, so the Go code sorts by `utf16.Encode`.

In populate-files, the TypeScript package was the one that changed. The Go port decided every file before writing any, so a refused write left everything as it was. The TypeScript package wrote files in parallel as it decided them, so a refusal could come after other files were written. The scenarios couldn't pin the files a failed call leaves while the two disagreed, so the TypeScript package changed to match the port in populate-files 1.2.3 ([commit](https://github.com/JacobLey/leyman/commit/fe4dff12)), and the scenarios now pin those files.

A third turned up the day before release. The released modules declare `go 1.24`, the oldest Go they support, and CI now runs each released module's tests on Go 1.24 as well as the current Go. That run failed: Go 1.24's JSON decoder reports an unclosed `{` or `[` only when asked for the closing delimiter, which genever-go's order-keeping JSON parser had been discarding, so truncated JSON was accepted. It now fails with `ErrSyntax` ([commit](https://github.com/JacobLey/leyman/commit/2783a6b7)).

## Where vectors stop

The vectors say which schemas are accepted and which values every generated type must hold. They can't say how narrow a Go type is, since Go has no union or literal types and a `json.RawMessage` field would hold every sample. So the Go tests also read each fixture's generated declarations back with `go/types` and compare them with what's expected: struct fields and their types, union variants, enum constants. A fixture without expectations fails, so a new one can't go unchecked. Neither implementation's tests compare generated text, so formatting can change freely.

For how genever-go compares with other Go generators, the [Go comparison](https://jacobley.github.io/leyman/packages/genever/go-comparison) runs it, [go-jsonschema](https://pkg.go.dev/github.com/atombender/go-jsonschema) and [oapi-codegen](https://pkg.go.dev/github.com/oapi-codegen/oapi-codegen/v2) through the same probes every night: 18 values decoded into the type generated from a JSON Schema, and 7 into the type for an OpenAPI request body. I wrote genever-go, and only its results are tested.

In the run of November 11, 2026:

| Tool          | Version                     | JSON Schema probes | OpenAPI probes |
| ------------- | --------------------------- | ------------------ | -------------- |
| genever-go    | 0.1.0                       | 18 / 18            | 7 / 7          |
| go-jsonschema | 0.24.1                      | 13 / 18            |                |
| oapi-codegen  | 2.8.2 (kin-openapi 0.152.0) |                    | 5 / 7          |

go-jsonschema's type doesn't keep `null` apart from an absent property, can't hold `null` as a member of a mixed enum, and decodes three values it should reject: a tuple with a string member, a `oneOf` branch with a property of the wrong type, and a `patternProperties` value of the wrong type. oapi-codegen's type decodes the tuple with a string member and doesn't keep `null` apart from absent in a mixed enum. Before kin-openapi 0.152.0, oapi-codegen's loader rejected the 3.1 document, so it scored 0 / 7.

## Try it

```sh
go get -tool github.com/JacobLey/leyman/apps/genever/go/cmd/genever@v0.1.0
```

```go
//go:generate go tool genever openapi.yaml --package api --signed
package api
```

It needs Go 1.24 or later, as does the code it writes. The released modules keep `replace` directives pointing at each other's workspace copies, so a change to populate-files is tested against genever before either is tagged. `go install` refuses a module with `replace` directives, which is why the install line uses `go get -tool`: it ignores a dependency's replaces and pins the version in your `go.mod`.

The [Go guide](https://jacobley.github.io/leyman/packages/genever/guides/go) covers the options and how Go types differ from the TypeScript ones. If a schema is accepted by one implementation and rejected by the other, that's a bug in one of them, and the [test vectors](https://github.com/JacobLey/leyman/tree/main/apps/genever/test-vectors) are where the fix starts.
