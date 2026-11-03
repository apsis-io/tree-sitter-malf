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
    [$._expression, $.pattern, $.constructor_pattern],
    [$.function_declaration, $._expression],
    [$.module_block_declaration, $.function_declaration, $._expression],
    [$.module_block_declaration, $.function_declaration, $._expression, $.block_type],
    [$.function_declaration, $.block_type, $._expression],
    [$.function_declaration, $.block_type],
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
    [$.extern_member, $.function_declaration],
  ],

  extras: ($) => [/\s/, $.comment_line],

  rules: {
    source_file: ($) => repeat(seq($._item, optional(";"))),

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
        $.export_declaration,
        $.export_default_declaration,
        $.export_star_declaration,
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
        optional(seq(field("label", $.identifier), ":", field("label_kind", choice($.identifier, $.operator_name)))),
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

    // `export * from "std/syntax"`, `export * as Prelude from "std/prelude"`
    export_star_declaration: ($) =>
      seq("export", "*", optional(seq("as", field("alias", $.type_identifier))),
        "from", field("path", choice($.string, $.import_uri, $.identifier))),

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
        $.integer, $.string, "<=>", field("op", $.type_identifier)),

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
      prec.right(20, seq("world", field("name", choice($.identifier, $.type_identifier)),
        optional(seq("=", field("target", $.extern_target))), "{",
        repeat(seq(choice("import", "export"), field("name", $.identifier),
          "=", field("target", $.extern_target))),
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
      seq("{", repeat(seq($.type_constraint, optional(";"))), "}"),

    type_constraint: ($) =>
      seq(field("subject", choice($.type_identifier, $.identifier)),
        "!:", field("constraint", $._type)),

    operator_name: ($) =>
      seq("(", choice(
        token(choice("+", "-", "*", "/", "%", "^", "==", "!=",
          "<", ">", "<=", ">=", "&&", "||", "|>", "<=>", "<~", "~>", "<~>",
          "<|>", "??", "-.", "!", "~", "**", "*.", "/.", "+.", "-.", "++", "@", "<+>", "<->",
          "<*>", "<$>", "::", ":=", "<-", "<<", "<<=", "<==", "<>", "=>>", ">>", ">>=",
          ">>>", "|>>", "=")),
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
              seq(optional($.attribute), optional("local"), field("name", choice($.identifier, $.type_identifier)), ":", field("type", $._type)),
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
    // application (`FwdProj(A -> B)`), or a bar-list of variants
    // (`= | None | Some(A)`).
    type_value: ($) =>
      choice(
        $._type,
        $.type_constructor,
        repeat1($.type_variant),
      ),

    type_constructor: ($) =>
      prec(PREC.CALL, seq(field("constructor", $.type_identifier),
        "(", commaSep($._type), ")")),

    record_type: ($) =>
      seq("{",
        repeat1(seq(optional(","), optional("mut"),
          field("name", $.identifier), ":", field("type", $._type))),
        optional(seq("|", field("extend", $._type))),
        "}"),

    type_variant: ($) =>
      prec.right(seq("|", field("name", $.type_identifier),
        optional(choice(
          seq("(", commaSep($._type), ")"),
          seq(choice("::", ":"), field("signature", $._type)),
        )))),

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
      seq(
        "|",
        field("name", choice($.type_identifier, $.identifier)),
        optional($.type_parameters),
        optional($.attribute),
        optional(choice(
          seq("::", field("signature", $._gadt_signature)),
          seq("=", field("signature", $._gadt_signature)),
          $._gadt_signature,
        )),
      ),

    attribute: ($) =>
      prec.left(seq("@", choice($.identifier, $.type_identifier), optional($.argument_list))),

    _gadt_signature: ($) =>
      prec.right(seq(
        repeat1(seq($.parameter_list, optional("."))),
        optional(seq("->", field("return", $._type))),
      )),

    for_statement: ($) =>
      choice(
        // Go-style: `for { ... }`, `for cond { ... }`, `for init; cond; post { ... }`
        seq("for", field("body", $.block)),
        prec(1, seq(
          "for",
          field("init", choice($.let_statement, $.assignment)),
          ";",
          field("condition", optional($._expression)),
          ";",
          field("post", optional(choice($.assignment, $._expression))),
          field("body", $.block),
        )),
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
      seq("interface", field("name", $.type_identifier), optional(seq("{", repeat($._type_member), "}"))),

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

    // `import "std/proj"`, `import { A, B } from "std/syntax"`,
    // `import { Fixpoint } from velocity:teleos`, and legacy `import foo`
    import_declaration: ($) =>
      seq("import",
        choice(
          field("path", choice($.identifier, $.string, $.import_uri)),
          // `import * from std:proj`
          seq("*", optional("from"),
            field("path", choice($.import_uri, $.string, $.identifier))),
          seq("{", commaSep(field("item", choice($.identifier, $.type_identifier))), "}",
            optional("from"),
            field("path", choice($.import_uri, $.string, $.identifier))),
        )),

    import_uri: ($) => token(/[a-z][a-zA-Z0-9_]*(\.[a-z][a-zA-Z0-9_]*)*:[A-Za-z0-9_./#@-]+/),

    let_statement: ($) =>
      seq(
        choice("let", "const"),
        optional(field("mode", choice("local", "once"))),
        field("name", choice($.identifier, $.pattern)),
        optional(seq(":", field("annotation", $._type))),
        "=",
        field("value", $._expression),
      ),

    ellipsis: ($) => "...",

    anonymous_function: ($) =>
      seq(
        optional(repeat1(choice("local", "once"))),
        "fn",
        paramLists($),
        optional(field("effects", $.effect_row)),
        "->",
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
        $.boolean,
        $.unit,
        $.list,
        $.hole,
        $.perform_expression,
        $.continue_expression,
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
    // Lexical precedence above the `//` comment extra: `"//"` stays a string.
    _string_content: ($) => token(prec(PREC.STRING, /[^\n"\\]+/)),
    escape_sequence: ($) => /\\[nrt\\"']/,

    list: ($) => seq("[", commaSep($._expression), "]"),

    perform_expression: ($) =>
      prec.right(PREC.CALL, seq("perform",
        choice(
          seq(field("effect", $.type_identifier), optional($.argument_list)),
          seq("(", field("effect", $.type_identifier), repeat($._expression), ")"),
        ))),

    continue_expression: ($) =>
      prec.right(PREC.CALL, seq("continue", field("continuation", $.identifier),
        optional(choice($.argument_list, repeat1($._expression))))),

    quote_expression: ($) => seq("<[", $._expression, "]>"),
    splice_expression: ($) => seq("$(", $._expression, ")"),

    // Bracket indexing: `g.op[i]`, `args[i]`
    index_expression: ($) =>
      prec(PREC.CALL, seq(field("receiver", $._expression), "[", $._expression, "]")),

    // Application: `f(a, b)` calls, `f x y` / `op_tag OpNeg` / `EInt 0`
    // juxtaposition, and mixed `Ctor (x) y` forms.
    call_expression: ($) =>
      prec.left(PREC.CALL, seq(
        field("function", $._expression),
        repeat1(choice(
          $.argument_list,
          field("arg", choice($.identifier, $.type_identifier, $.integer,
            $.float, $.string, $.boolean, $.unit)),
        )))),

    argument_list: ($) => seq("(", commaSep($._expression), ")"),

    // `r.method(x)`, field chains `res.red.green_id`, index access `args.(i)`
    ufcs_expression: ($) =>
      prec.right(PREC.CALL, seq(field("receiver", $._expression), ".",
        choice(
          seq(field("method", $.identifier), optional($.argument_list)),
          $.argument_list,
        ))),

    cons_expression: ($) =>
      prec.right(
        PREC.CONS,
        seq(field("head", $._expression), "::", field("tail", $._expression)),
      ),

    binary_expression: ($) =>
      choice(
        prec.left(PREC.PIPE, seq($._expression, choice("|>", "<~", "~>"), $._expression)),
        prec.left(PREC.OR, seq($._expression, "||", $._expression)),
        prec.left(PREC.AND, seq($._expression, "&&", $._expression)),
        prec.left(PREC.COMPARE, seq($._expression, choice("==", "!=", "<", ">", "<=", ">="), $._expression)),
        prec.left(PREC.ADD, seq($._expression, choice("+", "-", "^"), $._expression)),
        prec.left(PREC.MUL, seq($._expression, choice("*", "/", "%"), $._expression)),
      ),

    assignment: ($) =>
      prec.right(
        PREC.ASSIGN,
        seq(field("name", $.identifier), choice(":=", "<-"), field("value", $._expression)),
      ),

    deref_expression: ($) =>
      prec.left(PREC.UNARY + 1, seq(choice("&", "deref"), $._expression)),

    match_expression: ($) =>
      seq(
        "match",
        field("scrutinee", $._expression),
        "{",
        repeat1($.match_arm),
        "}",
      ),

    match_arm: ($) =>
      seq("|", field("pattern", $.pattern),
        optional(seq("if", field("guard", $._expression))),
        "->", field("body", $._expression)),

    if_expression: ($) =>
      choice(
        prec.right(seq(
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
        "effect",
        field("effect", $.type_identifier),
        optional(seq("(", field("arg", $.pattern), ")")),
        field("continuation", $.identifier),
        "->",
        field("body", $._expression),
      ),

    // Block bodies hold statements/expressions plus member declarations
    // (nested fns in unified blocks, `@entrypoint` attributes, `;` separators).
    block: ($) => seq("{",
      repeat(seq(choice(
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
      ), optional(";"))),
      "}"),

    // `{ op: node.op }`, `{ n = 0, ... }`, shorthand `{ file_id: }` —
    // field separators are commas or just whitespace.
    // `{ op: node.op }`, `{ n = 0 }`, functional update
    // `{ table with node_types = ... }` — commas or whitespace between fields.
    record_literal: ($) => seq("{",
      optional(seq(field("base", $._expression), "with")),
      repeat1(seq(optional(","),
        field("name", $.identifier),
        choice(":", "="),
        field("value", $._expression),
      )),
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
        $.unit,
        $.identifier,
        $.type_identifier,
        $.list_pattern,
        $.cons_pattern,
        $.typed_pattern,
        $.constructor_pattern,
        $.poly_variant,
        $.tuple_pattern,
      ),

    tuple_pattern: ($) => seq("(", commaSep($.pattern), ")"),

    wildcard_pattern: ($) => "_",
    list_pattern: ($) => seq("[", commaSep($.pattern), "]"),
    cons_pattern: ($) => prec.right(PREC.CONS, seq(field("head", $.pattern), "::", field("tail", $.pattern))),
    typed_pattern: ($) =>
      prec(PREC.UNARY, seq("(", field("pat", $.pattern), ":", field("type", $._type), ")")),
    constructor_pattern: ($) =>
      seq(
        field("constructor", $.type_identifier),
        optional(choice(
          seq("(", commaSep($.pattern), ")"),
          repeat1(field("arg", choice($.identifier, $.wildcard_pattern, $.string, $.integer, $.boolean))),
        )),
      ),

    // ============================ types ===================================

    _type: ($) =>
      choice(
        $.type_identifier,
        $.type_variable,
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

    type_identifier: ($) => /[A-Z][a-zA-Z0-9_]*/,

    generic_type: ($) =>
      prec(PREC.CALL, seq(field("constructor", $.type_identifier), "<", commaSep($._type), ">")),

    unit_type: ($) => "Unit",

    tuple_type: ($) => choice($.unit, prec(-1, seq("(", commaSep($._type), ")"))),

    list_type: ($) => prec(PREC.CALL, seq(field("elem", $._type), "list")),

    effect_arrow_type: ($) =>
      prec.right(
        PREC.ASSIGN,
        seq(
          $._type,
          optional(field("effects", $.effect_row)),
          "->",
          field("return", $._type),
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
