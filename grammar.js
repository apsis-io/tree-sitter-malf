/**
 * tree-sitter grammar for the Malformed (.malf) language.
 * Highlight-grade: precise enough for editor coloring, bracket structure,
 * and comment detection. Not a full semantic parser - the oxgo/malf
 * toolchain performs the real 6-stratum verification.
 */

const PREC = {
  COMMENT: 1,
  STRING: 2,
  ASSIGN: 3,
  PIPE: 4,
  OR: 5,
  AND: 6,
  COMPARE: 7,
  CONS: 8,
  SHIFT: 9,
  ADD: 10,
  MUL: 11,
  UNARY: 12,
  CALL: 13,
};

module.exports = grammar({
  name: "malf",

  word: ($) => $.identifier,

  conflicts: ($) => [
    [$.operator_name, $.pattern],
    [$.match_arm, $.handler_arm],
    [$.operator_name, $._expression, $.type_variable],
    [$._expression, $.pattern],
    [$.dotted_name, $._expression],
    [$.module_block_declaration, $.block_type, $._expression],
    [$._expression, $._type],
    [$._expression, $.parameter_list],
    [$._expression, $.effect_row],
    [$.parameter_list, $._expression, $.tuple_type, $.unit],
    [$._expression, $.tuple_type],
    [$.block_type, $.record_type, $.record_literal, $.block, $._expression],
    [$.block, $.block_type],
    [$.block, $.block_type, $.record_literal, $._expression],
    [$.block_type, $.record_literal],
    [$._expression, $.type_variable],
    [$.record_literal, $.block],
    [$.record_literal, $.block, $._expression],
    [$.function_declaration, $.module_block_declaration, $._expression],
    [$.argument_list, $.tuple_expression],
    [$.parameter_list, $.tuple_type],
    [$.cons_expression, $.function_declaration],
    [$.cons_expression, $.module_block_declaration],
    [$.cons_expression, $.extern_declaration],
    [$.cons_expression, $.effect_declaration],
    [$.cons_expression, $.infix_declaration],
    [$.operator_name, $._expression],
    [$.operator_name, $._expression, $.pattern],
    [$._expression, $.pattern, $.constructor_pattern],
    [$.function_declaration, $._expression],
    [$.module_block_declaration, $.function_declaration, $._expression],
    [$.module_block_declaration, $.function_declaration, $._expression, $.block_type],
    [$.function_declaration, $.block_type, $._expression],
    [$.function_declaration, $.block_type],
    [$.pattern, $.juxtaposed_pattern],
    [$.constructor_pattern],
    // trailing commas: keep the comma-shift and the close-early paths alive
    [$.record_type, $.record_literal],
    [$.record_type],
    [$.record_literal],
    // `{ x.f… }`: a dotted name may open a record entry (`x.f: 0`) or a UFCS
    // expression inside a block (`x.f()`); the `:`/`=` separator decides.
    [$.record_literal, $._expression],
    [$.gadt_variant, $.type_variable],
    [$.type_parameters, $._type],
    [$.effect_arrow_type],
    // `let x = if c { 1 } else { 2 }` + next statement `[A(1)]` — keep the
    // statement boundary alive against index-attachment (NL-significant law).
    [$.index_expression, $.let_statement],
    [$._expression, $.index_target],
    [$.index_target, $._type],
    [$.index_target, $.type_variable],
    [$._expression, $.index_target, $._type],
    [$._expression, $.index_target, $.type_variable],
    [$.effect_row, $.list],
    [$.index_target, $.pattern],
    [$.index_target, $.pattern, $.constructor_pattern],
    [$._expression, $.quote_expression],
    [$.ellipsis, $.list_pattern, $.pattern, $.juxtaposed_pattern],
    [$.ellipsis, $.list_pattern],
    [$.module_block_declaration, $._expression],
    [$._expression, $._statement],
    [$.pattern, $.constructor_pattern],
    [$.for_statement, $._expression],
    [$.list, $.list_pattern],
    [$.interface_declaration],
    [$.let_statement, $.pattern],
    [$.anonymous_function, $._expression],
    [$.try_expression],
    [$.extern_type_declaration],
    [$.extern_module_declaration],
    [$.parenthesized_expression, $.argument_list],
    [$.for_statement, $.pattern],
    [$._expression, $.constructor_pattern],
    [$.call_expression, $.constructor_pattern],
    [$.argument_list, $.constructor_pattern],
    [$.extern_member, $.function_declaration],
    [$._expression, $.qualified_type],
  ],

  extras: ($) => [/\s/, $.comment_line],

  rules: {
    source_file: ($) => repeat($._item),

    _item: ($) => choice($.declaration, $._expression, $._statement, $.attribute),

    // ============================ declarations ============================

    declaration: ($) =>
      prec(1, choice(
        $.effect_declaration,
        $.function_declaration,
        $.type_declaration,
        $.interface_declaration,
        $.module_declaration,
        $.implicit_declaration,
        $.import_declaration,
        $.let_statement,
        $.gadt_type_declaration,
        $.for_statement,
        $.extern_declaration,
        $.extern_type_declaration,
        $.extern_module_declaration,
        $.extend_type_declaration,
        $.world_declaration,
        $.wit_block_declaration,
        $.export_declaration,
        $.export_default_declaration,
        $.export_star_declaration,
        $.export_list_declaration,
        $.skin_declaration,
        $.infix_declaration,
        $.module_block_declaration,
      )),

    // `export f :: ...`, `export type X = ...`, ...
    export_declaration: ($) =>
      seq("export", field("decl", choice(
        $.function_declaration,
        $.type_declaration,
        $.gadt_type_declaration,
        $.let_statement,
        $.extern_declaration,
        $.effect_declaration,
        $.interface_declaration,
        $.module_declaration,
        $.module_block_declaration,
      ))),

    // `export infixl 4 (<=>) :: (fwd: A -> B) [] -> Proj<A, B> { ... }`
    // Relative precedence references: `(prec:above:(+) prec:below:(*))`,
    // `(prec:add / prec:(+))`, `(prec:cmp)`, `(prec:bit_*)`.
    prec_ref_group: ($) =>
      seq("(", "prec:",
        repeat1(choice($.prec_ref_word, $.operator_name, "/", ":")),
        ")"),

    prec_ref_word: ($) => token(/[a-z_][a-zA-Z0-9_*.]*/),

    // Binding-site fixity: `export infixl 4 (<=>) :: ... = Proj.iso` and
    // bare operator aliases: `infixr 8 (**)`.
    infix_declaration: ($) =>
      prec.right(seq(
        optional("export"),
        choice("prefix", "infix", "infixl", "infixr", "infixc", "postfix"),
        optional(seq(field("label", $.identifier), ":", field("label_kind", choice($.identifier, $.operator_name, "prefix", "infix", "infixl", "infixr", "infixc", "postfix")))),
        optional(choice($.integer, $.prec_ref_group)),
        field("op", $.operator_name),
        optional(
          seq(
            "::",
            paramLists($),
            optional(field("effects", $.effect_row)),
            "->",
            field("return_type", $._type),
            optional(field("return_effects", $.effect_row)),
            optional(seq("=", field("body_expr", choice($.extern_target, $._expression)))),
            optional(field("body", $.block)),
          ),
        ),
      )),

    // 1ML unified member block: `FormatterGolden :: { validate :: ... }`,
    // `export RootUnit :: { ... }`
    module_block_declaration: ($) =>
      prec.right(seq(
        field("name", choice($.identifier, $.type_identifier)),
        optional($.type_parameters),
        "::",
        optional(seq(field("annotation", $._type), "=")),
        field("body", choice($.block, $.record_literal, $._expression)),
      )),

    // `export default unwrap_or`
    export_default_declaration: ($) =>
      seq("export", "default", field("name", choice($.identifier, $.operator_name))),

    // `export * from "std/syntax"`, `export * as * from ...`, `export * as Prelude from "std/prelude"`
    export_star_declaration: ($) =>
      seq("export", "*", optional(seq("as", field("alias", choice("*", $.identifier, $.type_identifier)))),
        "from", field("path", choice($.string, $.import_uri, $.identifier))),

    // `export { spine_eq, spine_expr_eq } from std:omni/spine` — re-export lists;
    // bare `export { VelocityOp, OpAddInt, … }` re-exports imported names
    export_list_declaration: ($) =>
      seq("export", "{", commaSep(field("item", choice($.identifier, $.type_identifier))), "}",
        optional(seq("as", field("alias", choice("*", $.identifier, $.type_identifier)))),
        optional(seq("from", field("path", choice($.import_uri, $.string, $.identifier))))),

    // `export skin go <=> Ast { ... }` — lexer config, precedence bindings,
    // and HCLP rule declarations with quote templates.
    skin_declaration: ($) =>
      seq(optional("export"), "skin", field("name", $.identifier), "<=>",
        field("target", $.type_identifier), "{",
        repeat(choice($.skin_lexer, $.skin_binding, $.skin_rule, $._statement, $._expression)),
        "}"),

    skin_lexer: ($) =>
      seq("lexer", "{",
        repeat(seq(seq(field("name", $.identifier), ":", field("value", $._expression)),
          optional(","))),
        "}"),

    skin_binding: ($) =>
      seq(choice("prefix", "infix", "infixl", "infixr", "infixc", "postfix"),
        $.integer, choice($.string, seq("(", $.string, ")")), "<=>",
        field("op", $.type_identifier)),

    skin_rule: ($) =>
      seq("rule", field("name", $.identifier), "(",
        repeat1(choice(
          $.string,
          seq(optional(field("label", $.identifier)), ":", field("item", $.identifier)),
          $.identifier,
        )),
        ")", "<=>", field("template", $.quote_expression)),

    // Host interop: `extern f :: (x: T) [E] -> R = go:path.Sym`
    // Quoted qualified names: `extern "Code.run" :: (c: Code<T>). [] -> T = "__stdlib_runcode_run"`
    extern_declaration: ($) =>
      seq("extern", field("name", choice($.identifier, $.extern_name, $.dotted_name)), "::",
        paramLists($),
        optional(field("effects", $.effect_row)),
        "->",
        field("return_type", $._type),
        optional(field("return_effects", $.effect_row)),
        "=",
        field("target", $.extern_target)),

    // Targets: quoted symbols, any-scheme URIs (`velocity:stdlib/x`),
    // dotted symbols, or bare identifiers (`= or`).
    extern_target: ($) => prec(2, choice($.string, $.import_uri, $.identifier,
      $.dotted_name)),

    // Quoted dot-qualified extern names lex as opaque tokens so the `.` in
    // `"Code.run"` never parses as a UFCS receiver.
    extern_name: ($) => token(seq('"', /[^"\s]+/, '"')),

    // Bare dotted declaration names: `Teleos.converge_chain`, `FwdProj.make`,
    // `Bool.and`. Competes with UFCS `Type.member` access; resolved through
    // the declared conflict with `_expression`.
    dotted_name: ($) => seq($.type_identifier, ".", $.identifier),

    extern_type_declaration: ($) =>
      seq("extern", "type", field("name", $.type_identifier),
        optional($.type_parameters), "=",
        field("target", $.extern_target),
        optional(seq("{", repeat($.extern_member), "}"))),

    extern_module_declaration: ($) =>
      seq("extern", "module", field("name", $.type_identifier),
        optional($.type_parameters), "=",
        field("target", $.extern_target),
        optional(seq("{", repeat($.extern_member), "}"))),

    extern_member: ($) =>
      seq(field("name", choice($.identifier, $.extern_name)), "::",
        paramLists($),
        optional(field("effects", $.effect_row)),
        "->",
        field("return_type", $._type),
        optional(field("return_effects", $.effect_row)),
        "=",
        field("target", $.extern_target)),

    extend_type_declaration: ($) =>
      seq("extend", "type", field("name", $.type_identifier), "{",
        repeat(choice($.function_declaration, $.extern_member)), "}"),

    world_declaration: ($) =>
      prec.right(20, seq("world", field("name", choice($.identifier, $.type_identifier, $.wit_word)),
        optional(seq("=", field("target", $.extern_target))), "{",
        repeat(choice(
          seq(choice("import", "export"), field("name", $.identifier),
            "=", field("target", $.extern_target)),
          // `export { member :: (x: T) [] -> R }` — signature member blocks
          seq(choice("import", "export"), field("members", $.block)),
          // WIT signature members: `export process-file: func(in: s32) -> s64`
          $.wit_interface_member,
        )),
        "}")),

    effect_declaration: ($) =>
      seq("effect", field("name", $.type_identifier), "::", $._type),

    function_declaration: ($) =>
      prec.right(seq(
        field("name", choice($.identifier, $.operator_name, $.dotted_name, $.type_identifier)),
        optional(field("type_params", $.type_parameters)),
        "::",
        paramLists($),
        optional(field("effects", $.effect_row)),
        "->",
        field("return_type", $._type),
        optional(field("return_effects", $.effect_row)),
        optional(seq("where", field("constraints", $.constraint_block))),
        optional(seq("=", field("body_expr", choice($.extern_target, $._expression)))),
        optional(field("body", $.block)),
      )),

    // `where { T !: (_ -> _) }` — type-constraint block between the
    // signature and the body.
    constraint_block: ($) =>
      seq("{", repeat($.type_constraint), "}"),

    type_constraint: ($) =>
      seq(field("subject", choice($.type_identifier, $.identifier)),
        "!:", field("constraint", $._type)),

    operator_name: ($) =>
      seq("(", choice(
        token(choice("+", "-", "*", "/", "%", "^", "==", "!=",
          "<", ">", "<=", ">=", "&&", "||", "|>", "<=>", "<~", "~>", "<~>",
          "<|>", "??", "-.", "!", "~", "**", "*.", "/.", "+.", "-.", "++", "@", "<+>", "<->",
          "<*>", "<$>", "::", ":=", "<-", "<<", "<<=", "<==", "<>", "=>>", ">>", ">>=",
          "<=<", ">=>", "|",
          ">>>", "|>>", "=",
          // Single-sigil let operator: `(let*)`, `(let+)`, `(let!)`, `(let?)`, etc.
          token(/let[*+!?&|$%^~]/))),
        // word operator sections: `(not)`, `(deref)`
        $.identifier,
      ), ")"),

    type_parameters: ($) => seq("<", commaSep1($.type_identifier), ">"),

    parameter_list: ($) =>
      prec(1, choice(
        $.unit,
        seq(
          "(",
          commaSep(
            choice(
              seq(repeat($.attribute), optional("local"), field("name", choice($.identifier, $.type_identifier)), ":", field("type", $._type)),
              field("type", $._type),
            ),
          ),
          ")",
        ),
      )),

    effect_row: ($) =>
      seq(
        "[",
        commaSep(choice(
          $.type_identifier,
          $.identifier,
          $.hole,
          // rest rows: `[..E]`
          seq("..", choice($.identifier, $.type_identifier)),
          // local capability bindings: `[local dr: Observe]`
          seq("local", field("name", $.identifier), ":", field("type", choice($.type_identifier, $.identifier))),
        )),
        optional(seq("|", choice($.type_identifier, $.identifier, $.hole))),
        "]",
      ),

    type_declaration: ($) =>
      seq(
        "type",
        field("name", $.type_identifier),
        optional($.type_parameters),
        optional(seq("=", field("value", $.type_value))),
      ),

    // RHS of a type binding: a plain type (incl. records), a constructor
    // application (`FwdProj(A -> B)`), a bar-list of variants
    // (`= | None | Some(A)`), or the bare-first form
    // (`= Leaf | Node(Tree, Int, Tree)`).
    type_value: ($) =>
      choice(
        $._type,
        $.type_constructor,
        repeat1($.type_variant),
        prec(1, seq($._variant_body, repeat1($.type_variant))),
      ),

    _variant_body: ($) =>
      seq(field("name", $.type_identifier),
        optional(seq("(", commaSep($._type), ")")),
        optional(seq(choice("::", ":"), field("signature", $._type)))),

    type_constructor: ($) =>
      prec(PREC.CALL, seq(field("constructor", $.type_identifier),
        "(", commaSep($._type), ")")),

    record_type: ($) =>
      seq("{",
        repeat(seq(optional("mut"),
          field("name", $.identifier), ":", field("type", $._type), ",")),
        optional(seq(optional("mut"),
          field("name", $.identifier), ":", field("type", $._type))),
        optional(","),
        optional(seq("|", field("extend", $._type))),
        "}"),

    type_variant: ($) =>
      prec.right(seq("|", field("name", $.type_identifier),
        // constructor args, then an optional `::` full signature or a bare
        // `: Index` GADT index annotation — both may appear together
        // (`| Conn(Int) : Conn<S>`)
        optional(seq("(", commaSep($._type), ")")),
        optional(seq(choice("::", ":"), field("signature", $._type))),
      )),

    gadt_type_declaration: ($) =>
      seq(
        "type",
        field("name", $.type_identifier),
        optional($.type_parameters),
        "=",
        "{",
        repeat1($.gadt_variant),
        "}",
      ),

    gadt_variant: ($) =>
      prec(1, seq(
        "|",
        field("name", choice($.type_identifier, $.identifier)),
        optional($.type_parameters),
        optional($.attribute),
        optional(choice(
          seq("::", field("signature", $._gadt_signature)),
          seq("=", field("signature", $._gadt_signature)),
          seq(":", field("index", $._type)),
          $._gadt_signature,
        )),
      )),

    attribute: ($) =>
      prec.left(seq("@", choice($.identifier, $.type_identifier), optional($.argument_list))),

    _gadt_signature: ($) =>
      prec.right(seq(
        repeat1(seq($.parameter_list, optional("."))),
        optional(seq("->", field("return", $._type))),
      )),

    for_statement: ($) =>
      choice(
        // `for { ... }`, `for cond { ... }`
        seq("for", field("body", $.block)),
        seq("for", field("condition", $._expression), field("body", $.block)),
        // Range / collection: `for i in 0..n`, `for i, (a, b) in xs`
        seq(
          "for",
          optional(seq(field("index", $.identifier), ",")),
          field("variable", choice($.identifier, $.pattern)),
          "in",
          field("iterable", $._expression),
          optional(choice(
            seq("..", field("end", $._expression)),
            seq("..=", field("end", $._expression)),
          )),
          field("body", $.block),
        ),
      ),

    parenthesized_expression: ($) => seq("(", $._expression, ")"),

    arrow_block: ($) => seq("{", "->", $._expression, "}"),

    question_postfix: ($) => prec(PREC.UNARY, seq($._expression, "?")),

    interface_declaration: ($) =>
      seq("interface", field("name", choice($.type_identifier, $.wit_word)),
        optional(seq("{", repeat(choice($._type_member, $.wit_interface_member)), "}"))),

    // Embedded WIT (theory/golden/02): `package apsis:io@0.1.0;` headers and
    // `read-bytes: func(path: string) -> result<string, string>;` members —
    // hyphenated names, `func` keyword, and result/option generic types.
    wit_package_declaration: ($) =>
      seq("package", field("uri", $.import_uri)),

    // `malformed wit { package ns:name@1.0.0  interface x { … } }` — the
    // embedded WIT sub-language for world contracts (theory/golden/02).
    // The language has no semicolons; none appear here.
    wit_block_declaration: ($) =>
      seq("malformed", "wit", "{",
        repeat(choice($.wit_package_declaration, $.interface_declaration, $.world_declaration)),
        "}"),

    wit_interface_member: ($) =>
      choice(
        seq(
          optional("export"),
          field("name", $.wit_word),
          ":",
          "func",
          "(",
          commaSep(seq(field("param", $.wit_word), ":", field("type", $.wit_type))),
          ")",
          optional(seq("->", field("result", $.wit_type))),
        ),
        // `import file-system` inside an interface or world
        seq("import", field("name", choice($.wit_word, $.import_uri))),
      ),

    // WIT words: lowercase-start, optional kebab segments (`compiler-host`,
    // `logger`, `result<string>`, `s64`). Disjoint from Malf type
    // identifiers (uppercase-start), so worlds like `ClockService` stay
    // type_identifiers.
    wit_word: ($) => token(/[a-z][a-zA-Z0-9_]*(-[a-zA-Z0-9]+)*/),

    wit_type: ($) => prec.right(seq(
      field("name", $.wit_word),
      optional(seq("<", commaSep(choice($.wit_type, $.hole, "_")), ">")),
    )),

    _type_member: ($) =>
      choice(
        seq(
          field("name", $.identifier),
          "::",
          paramLists($),
          optional(field("effects", $.effect_row)),
          "->",
          field("type", $._type),
          optional(field("return_effects", $.effect_row)),
        ),
        seq("type", field("name", choice($.identifier, $.type_identifier)), optional(seq("=", $._type))),
      ),

    module_declaration: ($) =>
      prec.right(seq("module", field("name", $.type_identifier), optional("="), optional(field("body", $.block)))),

    implicit_declaration: ($) =>
      seq("implicit", "module", field("name", $.type_identifier), ":", field("signature", $.type_identifier)),

    // `import "std/proj"`, `import Alias "std/proj"`, `import { A, B } from "std/syntax"`,
    // `import { A, B } as * from std:omni`, `import * as * from std:proj`, and legacy `import foo`
    import_declaration: ($) =>
      prec.right(seq("import",
        choice(
          field("path", choice($.identifier, $.string, $.import_uri)),
          seq(field("alias", choice($.identifier, $.type_identifier)),
            field("path", choice($.string, $.import_uri))),
          // `import * from std:proj`, `import * as * from std:proj`, `import * as Alias from std:proj`
          seq("*",
            optional(seq("as", field("alias", choice("*", $.identifier, $.type_identifier)))),
            optional("from"),
            field("path", choice($.import_uri, $.string, $.identifier))),
          seq("{", commaSep(field("item", choice($.identifier, $.type_identifier))), "}",
            optional(seq("as", field("alias", choice("*", $.identifier, $.type_identifier)))),
            optional("from"),
            field("path", choice($.import_uri, $.string, $.identifier))),
        ))),

    import_uri: ($) => token(choice(
      /[a-z][a-zA-Z0-9_]*(\.[a-z][a-zA-Z0-9_]*)*:[A-Za-z0-9_./#@-]+/,
      /\.?\.\/[A-Za-z0-9_./-]+/,
    )),

    let_statement: ($) =>
      prec.dynamic(1, seq(
        choice("let", token(/let[*+!?&|$%^~]/), "const"),
        optional(field("mode", choice("local", "once", "rec"))),
        field("name", choice($.identifier, $.operator_name, $.pattern)),
        optional(seq(":", field("annotation", $._type))),
        "=",
        field("value", $._expression),
      )),

    ellipsis: ($) => "...",

    anonymous_function: ($) =>
      seq(
        optional(repeat1(choice("local", "once"))),
        "fn",
        paramLists($),
        optional(field("effects", $.effect_row)),
        "->",
        // `fn (x: T) -> Ret { body }` — annotated or bare
        optional(field("return_type", $._type)),
        field("body", choice($._expression, $.block)),
      ),

    // ============================ expressions =============================

    _expression: ($) =>
      choice(
        $.anonymous_function,
        $.ellipsis,
        $.identifier,
        $.type_identifier,
        $.integer,
        $.float,
        $.string,
        $.raw_string,
        $.char,
        $.boolean,
        $.unit,
        $.list,
        $.hole,
        $.quote_expression,
        $.splice_expression,
        $.ufcs_expression,
        $.call_expression,
        $.parenthesized_expression,
        $.deref_expression,
        $.cons_expression,
        $.binary_expression,
        $.assignment,
        $.match_expression,
        $.if_expression,
        $.try_expression,
        $.record_update_expression,
        $.dynamic_binary_expression,
        $.block,
        $.arrow_block,
        $.question_postfix,
        $.record_literal,
        $.poly_variant,
        $.unary_expression,
        $.tuple_expression,
        $.index_expression,
      ),

    identifier: ($) => /[a-z_][a-zA-Z0-9_']*/,
    type_identifier: ($) => /[A-Z][a-zA-Z0-9_]*/,
    integer: ($) => /-?[0-9][0-9_]*/,
    float: ($) => /-?[0-9][0-9_]*\.[0-9_]+/,
    boolean: ($) => choice("true", "false"),
    unit: ($) => "()",
    hole: ($) => choice("?", /\?[a-zA-Z_][a-zA-Z0-9_]*/),

    string: ($) =>
      seq(
        '"',
        repeat(choice($.escape_sequence, $._string_content)),
        '"',
      ),

    // Backtick raw strings (string-literal-mode epoch 2+): escape-free,
    // may span lines; longest-match keeps `Tag` constructors working.
    raw_string: ($) => token(seq("`", /[^`]*/, "`")),
    char: ($) => seq("'", choice($.escape_sequence, /[^'\\\n]/), "'"),
    // Lexical precedence above the `//` comment extra: `"//"` stays a string.
    _string_content: ($) => token(prec(PREC.STRING, /[^\n"\\]+/)),
    escape_sequence: ($) => /\\([nrt0\\"']|x[0-9a-fA-F]{2}|u\{[0-9a-fA-F]+\})/,

    list: ($) => seq("[", commaSep($._expression), "]"),

    // Skin template: `<[ let $(lhs) : $(ty) = $(rhs) ]>` — statement shapes
    // with splices; the skeleton is template atoms, not parsed code.
    // Templates nest (`<[ fn () -> <[ … ]> ]>`): the nested form outranks
    // atom-scanning so the inner `]>` closes the inner template.
    quote_expression: ($) => seq("<[", repeat(choice(
      prec(1, $.quote_expression),
      $.splice_expression,
      $.quote_atom,
    )), "]>"),

    quote_atom: ($) => token(choice(
      /[a-zA-Z_][a-zA-Z0-9_]*/,
      /[+\-*/%<>=!&|:;,.?@^~']+/,
      /[()\[\]{}]/,
      /[0-9]+/,
      /"[^"]*"/,
    )),
    splice_expression: ($) => seq("$(", $._expression, ")"),

    // Record functional update (`base with { field: val, a.b = val }`)
    // and in-place record mutation (`base <- with { field: val, a.b = val }`).
    record_update_expression: ($) => prec.left(PREC.ASSIGN, seq(
      field("base", $._expression),
      optional("<-"),
      "with",
      field("fields", $.record_literal),
    )),

    // Bracket indexing: `g.op[i]`, `args[i]`, `x[i][j]` — receivers are
    // value chains (never a bare if/block/list), so a following `[...]`
    // statement can't be swallowed as an index.
    index_expression: ($) =>
      prec(PREC.CALL, seq(field("receiver", $.index_target), "[", $._expression, "]")),

    index_target: ($) => choice(
      $.identifier,
      $.type_identifier,
      $.ufcs_expression,
      $.call_expression,
      $.index_expression,
      $.deref_expression,
      $.splice_expression,
    ),

    // Application: `f(a, b)` calls, `f x y` / `op_tag OpNeg` / `EInt 0`
    // juxtaposition, and mixed `Ctor (x) y` forms.
    call_expression: ($) =>
      prec.left(PREC.CALL, seq(
        field("function", choice(
          $.identifier,
          $.type_identifier,
          $.ufcs_expression,
          $.call_expression,
          $.parenthesized_expression,
          $.index_expression,
          $.anonymous_function,
          $.splice_expression,
          $.deref_expression,
          $.poly_variant,
          // operator section applied to a tuple: `(>>=)(m, f)`
          $.operator_name,
        )),
        repeat1(choice(
          $.argument_list,
          field("arg", choice($.identifier, $.type_identifier, $.integer,
            $.float, $.string, $.boolean, $.unit)),
        )))),

    argument_list: ($) => seq("(", commaSep($._expression), ")"),

    // `r.method(x)`, field chains `res.red.green_id`, index access `args.(i)`, `Pkg.Ctor(x)`
    ufcs_expression: ($) =>
      prec.right(PREC.CALL, seq(field("receiver", $._expression), ".",
        choice(
          seq(field("method", choice($.identifier, $.type_identifier)), optional($.argument_list)),
          $.argument_list,
        ))),

    cons_expression: ($) =>
      prec.right(
        PREC.CONS,
        seq(field("head", $._expression), "::", field("tail", $._expression)),
      ),

    binary_expression: ($) =>
      choice(
        prec.left(PREC.PIPE, seq($._expression, choice("|>", "<~", "~>", "<=>"), $._expression)),
        prec.left(PREC.OR, seq($._expression, "||", $._expression)),
        prec.left(PREC.SHIFT, seq($._expression, choice("<<", ">>", ">>>", "lsl", "asr", "lsr", "land", "lor", "lxor"), $._expression)),
        prec.left(PREC.AND, seq($._expression, "&&", $._expression)),
        prec.left(PREC.COMPARE, seq($._expression, choice("==", "!=", "<", ">", "<=", ">="), $._expression)),
        prec.left(PREC.ADD, seq($._expression, choice("+", "-", "^"), $._expression)),
        prec.left(PREC.MUL, seq($._expression, choice("*", "/", "%", "mod", "**"), $._expression)),
      ),

    // Dynamically declared operators (prefix/infixl/infixr prec declarations):
    // any symbolic run parses as a binary operator. The token sits below every
    // static token lexically and the rule below every static rule by parse
    // precedence, so `+`, `<`, `::`, `//` comments etc. keep their meanings;
    // anything else declared via fixity resolves here.
    dynamic_binary_expression: ($) =>
      prec.dynamic(-1, prec.left(PREC.ASSIGN, seq(
        field("left", $._expression),
        field("op", $.dynamic_operator),
        field("right", $._expression),
      ))),

    dynamic_operator: ($) => token(/[+\-*\/%<>=!&|~^?@.]+/),

    assignment: ($) =>
      prec.right(
        PREC.ASSIGN,
        seq(field("target", $._expression), choice(":=", "<-"), field("value", $._expression)),
      ),

    deref_expression: ($) =>
      prec.left(PREC.UNARY + 1, seq(choice("&", "deref"), $._expression)),

    match_expression: ($) =>
      seq(
        "match",
        field("scrutinee", $._expression),
        "{",
        repeat1(choice($.match_arm, $.handler_arm)),
        "}",
      ),

    match_arm: ($) =>
      seq("|", field("pattern", $.pattern),
        optional(seq("if", field("guard", $._expression))),
        "->", field("body", choice($._expression, prec.right(seq(repeat1($._statement), $._expression))))),

    if_expression: ($) =>
      choice(
        // Above CALL so a trailing `[...]` statement attaches to the next
        // statement, not as an index on the else block (`{ 2 } [A(1)]`).
        prec.right(PREC.CALL + 1, seq(
          "if",
          field("condition", $._expression),
          field("then", $.block),
          optional(seq("else", field("else", choice($.block, $.if_expression)))),
        )),
        prec.right(seq(
          "if",
          field("condition", $._expression),
          "then",
          field("then", $._expression),
          "else",
          field("else", $._expression),
        )),
      ),

    try_expression: ($) =>
      seq(
        "try",
        field("body", $._expression),
        "with",
        optional("{"),
        repeat1($.handler_arm),
        optional("}"),
      ),

    handler_arm: ($) =>
      seq(
        "|",
        choice(
          // `| effect (Fetch key) k -> ...`
          seq(
            "effect",
            choice(
              seq(
                field("effect", choice($.type_identifier, $.identifier)),
                optional(seq("(", field("arg", $.pattern), ")")),
              ),
              seq(
                "(",
                field("effect", choice($.type_identifier, $.identifier)),
                optional(field("arg", $.pattern)),
                ")",
              ),
            ),
            field("continuation", $.identifier),
          ),
          // `| v -> v` — value catch arm
          field("value", $.pattern),
        ),
        "->",
        field("body", $._expression),
      ),

    // Block bodies hold statements/expressions plus member declarations
    // (nested fns in unified blocks, `@entrypoint` attributes).
    block: ($) => seq("{",
      repeat(choice(
        $._statement,
        $._expression,
        $.function_declaration,
        $.type_declaration,
        $.extern_declaration,
        $.effect_declaration,
        $.module_block_declaration,
        $.export_declaration,
        $.export_star_declaration,
        $.attribute,
      )),
      "}"),

    // `{ op: node.op }`, `{ a.b.c = 0, ... }`, shorthand `{ file_id: }` —
    // field separators are commas or just whitespace.
    record_literal: ($) => seq("{",
      optional(","),
      repeat(seq(
        field("name", seq($.identifier, repeat(seq(".", $.identifier)))),
        choice(":", "="),
        field("value", $._expression),
        ",",
      )),
      optional(seq(
        field("name", seq($.identifier, repeat(seq(".", $.identifier)))),
        choice(":", "="),
        field("value", $._expression),
      )),
      optional(","),
      "}"),

    unary_expression: ($) =>
      prec.left(PREC.UNARY + 1, seq(choice("!", "-"), $._expression)),

    tuple_expression: ($) =>
      prec(-1, seq("(", $._expression, repeat1(seq(",", $._expression)), ")")),

    poly_variant: ($) => prec.left(PREC.CALL,
      seq("`", choice($.type_identifier, $.identifier), optional($.argument_list))),

    _statement: ($) => choice($.let_statement, $.assignment, $.for_statement),

    // ============================ patterns ================================

    pattern: ($) =>
      choice(
        $.wildcard_pattern,
        $.boolean,
        $.integer,
        $.string,
        $.raw_string,
        $.unit,
        $.ellipsis,
        $.identifier,
        $.type_identifier,
        $.list_pattern,
        $.cons_pattern,
        $.juxtaposed_pattern,
        $.typed_pattern,
        $.constructor_pattern,
        $.poly_variant,
        $.tuple_pattern,
        $.or_pattern,
      ),

    juxtaposed_pattern: ($) =>
      prec.right(seq(choice($.tuple_pattern, $.typed_pattern), $.pattern)),

    // `| A | B -> x` — alternatives share the arm bar.
    or_pattern: ($) => prec.right(seq(field("left", $.pattern), "|", field("right", $.pattern))),

    tuple_pattern: ($) => seq("(", commaSep($.pattern), ")"),

    wildcard_pattern: ($) => "_",
    // `[a, b]`, `[h, ... rest]` — the rest element spreads the tail.
    list_pattern: ($) => seq("[",
      optional(commaSep($.pattern)),
      optional(seq(",", "...", field("rest", $.pattern))),
      optional($.pattern),
      "]"),
    cons_pattern: ($) => prec.right(PREC.CONS, seq(field("head", $.pattern), "::", field("tail", $.pattern))),
    typed_pattern: ($) =>
      prec(PREC.UNARY, seq("(", field("pat", $.pattern), ":", field("type", $._type), ")")),
    constructor_pattern: ($) =>
      seq(
        field("constructor", choice(
          $.type_identifier,
          seq(choice($.identifier, $.type_identifier), ".", $.type_identifier),
        )),
        optional(choice(
          seq("(", commaSep($.pattern), ")"),
          repeat1(field("arg", choice($.identifier, $.wildcard_pattern, $.string, $.integer, $.boolean))),
        )),
      ),

    // ============================ types ===================================

    qualified_type: ($) =>
      seq(choice($.identifier, $.type_identifier), ".", $.type_identifier),

    _type: ($) =>
      choice(
        $.qualified_type,
        $.type_identifier,
        $.type_variable,
        $.tick_type_variable,
        $.generic_type,
        $.unit_type,
        $.tuple_type,
        $.list_type,
        $.effect_arrow_type,
        $.record_type,
        $.block_type,
        $.local_type,
        $.mode_type,
      ),

    // 1ML block type: `{ run :: (x: Int) [] -> Int [] }` — member signatures.
    block_type: ($) =>
      prec(1, seq("{",
        repeat(seq(optional(","),
          field("name", $.identifier),
          "::",
          paramLists($),
          optional(field("effects", $.effect_row)),
          "->",
          field("return", $._type),
          optional(field("return_effects", $.effect_row)),
        )),
        "}")),

    // Lowercase abstract type names, e.g. interface member `t` in `(a: t)`.
    type_variable: ($) => $.identifier,

    // Tick-quoted type variable, e.g. `'a -> Code<Int -> Int>`.
    tick_type_variable: ($) => seq("'", $.identifier),

    type_identifier: ($) => /[A-Z][a-zA-Z0-9_]*/,

    generic_type: ($) =>
      prec(PREC.CALL, seq(field("constructor", $.type_identifier), "<", commaSep($._type), ">")),

    unit_type: ($) => "Unit",

    tuple_type: ($) => choice($.unit, prec(0, seq("(", commaSep($._type), ")"))),

    list_type: ($) => prec(PREC.CALL, seq(field("elem", $._type), "list")),

    effect_arrow_type: ($) =>
      prec.right(
        PREC.ASSIGN,
        seq(
          // Multi-group inputs: `(compute: (Int) (List<Int>) -> Int)`
          repeat(prec(-1, seq("(", commaSep($._type), ")"))),
          optional($._type),
          optional(field("effects", $.effect_row)),
          "->",
          field("return", $._type),
          optional(field("return_effects", $.effect_row)),
        ),
      ),

    local_type: ($) => prec.right(PREC.UNARY, seq("local", $._type)),

    mode_type: ($) => prec.right(PREC.UNARY, seq(
      choice("unique", "once", "many", "aliased", "global", "lazy",
        "portable", "frozen", "shared", "contended"),
      $._type)),

    comment_line: ($) => token(prec(PREC.COMMENT, seq("//", /[^\n]*/))),
  },
});

function commaSep(rule) {
  return optional(commaSep1(rule));
}

// Zero or more parameter groups, each optionally followed by the tight
// receiver mark: `(opt: Option<T>). (f: A -> B) [] -> Option<B>`
function paramLists($) {
  return repeat(seq($.parameter_list, optional(".")));
}

function commaSep1(rule) {
  return seq(rule, repeat(seq(",", rule)));
}
