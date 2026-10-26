/**
 * tree-sitter grammar for the Malformed (.malf) language.
 * Highlight-grade: precise enough for editor coloring, bracket structure,
 * and comment detection. Not a full semantic parser — the oxgo/malf
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
    [$.function_declaration, $._expression, $.pattern],
    [$.declaration, $._expression, $.pattern],
    [$._expression, $.pattern, $.constructor_pattern],
    [$.declaration, $._statement],
    [$.declaration, $._statement, $._expression, $.pattern],
    [$._expression, $._statement],
    [$.pattern, $.constructor_pattern],
    [$.gadt_type_declaration, $.type_declaration],
    [$.for_statement, $._expression],
    [$.arrow_block, $.block],
    [$.question_postfix, $._expression],
    [$.question_postfix, $.splice_expression],
    [$.list, $.list_pattern],
    [$._expression, $.list_pattern],
    [$.declaration, $.interface_declaration],
    [$.interface_declaration],
    [$.declaration],
    [$.let_statement, $.pattern],
    [$.let_statement, $._expression, $.pattern],
    [$.let_statement, $.perform_expression],
    [$.anonymous_function, $._expression],
    [$.comptime_expression, $.call_expression],
    [$.comptime_expression, $.ufcs_expression],
    [$.quote_expression, $.comptime_expression, $.call_expression, $.ufcs_expression],
    [$.type_declaration, $._type],
    [$.try_expression],
    [$.try_expression, $._expression],
    [$.constructor_pattern],
    [$.applied_identifier, $._expression],
    [$.type_variable, $._expression],
    [$.type_variable, $.pattern],
    [$.pattern, $.type_variable],
    [$.record_literal, $.block],
    [$.function_declaration],
    [$.extern_type_declaration],
    [$.extern_module_declaration],
    [$.world_declaration],
    [$.pattern, $.poly_variant],
    [$.pattern, $.tuple_pattern],
    [$._expression, $.tuple_pattern],
    [$.argument_list, $.tuple_pattern],
    [$.parenthesized_expression, $.argument_list],
    [$.poly_variant, $._expression],
    [$.parenthesized_expression],
    [$.for_statement, $.parenthesized_expression],
    [$.for_statement, $.pattern],
    [$.for_statement, $._expression, $.pattern],
  ],

  extras: ($) => [/\s/, $.comment_line],

  rules: {
    source_file: ($) => repeat($._item),

    _item: ($) => choice($.declaration, $._expression, $._statement),

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
      )),

    // Host interop: `extern f :: (x: T) [E] -> R = go:path.Sym`
    extern_declaration: ($) =>
      seq("extern", field("name", $.identifier), "::",
        repeat($.parameter_list),
        optional(field("effects", $.effect_row)),
        "->",
        field("return_type", $._type),
        "=",
        field("target", $.extern_target)),

    extern_target: ($) => token(/(go|wit):[^\s{}]+/),

    extern_type_declaration: ($) =>
      seq("extern", "type", field("name", $.type_identifier), "=",
        field("target", $.extern_target),
        optional(seq("{", repeat($.extern_member), "}"))),

    extern_module_declaration: ($) =>
      seq("extern", "module", field("name", $.type_identifier), "=",
        field("target", $.extern_target),
        optional(seq("{", repeat($.extern_member), "}"))),

    extern_member: ($) =>
      seq(field("name", $.identifier), "::",
        repeat($.parameter_list),
        optional(field("effects", $.effect_row)),
        "->",
        field("return_type", $._type),
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
      seq(
        field("name", choice($.identifier, $.operator_name)),
        optional(field("type_params", $.type_parameters)),
        "::",
        repeat($.parameter_list),
        optional(field("effects", $.effect_row)),
        "->",
        field("return_type", $._type),
        optional(seq("=", field("target", $.extern_target))),
        field("body", $.block),
      ),

    operator_name: ($) =>
      seq("(", token(choice("+", "-", "*", "/", "%", "^", "==", "!=",
        "<", ">", "<=", ">=", "&&", "||", "|>")), ")"),

    type_parameters: ($) => seq("<", repeat1($.type_identifier), ">"),

    parameter_list: ($) =>
      seq("(", commaSep(seq(optional("local"), field("name", $.identifier), ":", field("type", $._type))), ")"),

    effect_row: ($) => seq("[", commaSep(choice($.type_identifier, $.hole)), "]"),

    type_declaration: ($) =>
      seq("type", field("name", $.type_identifier), optional(seq("=", choice($.type_identifier, $._type)))),

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
        repeat1($.parameter_list),
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
        seq(field("name", $.identifier), "::", repeat($.parameter_list), "->", field("type", $._type)),
        seq("type", field("name", choice($.identifier, $.type_identifier)), optional(seq("=", $._type))),
      ),

    module_declaration: ($) => seq("module", field("name", $.type_identifier)),

    implicit_declaration: ($) =>
      seq("implicit", "module", field("name", $.type_identifier), ":", field("signature", $.type_identifier)),

    import_declaration: ($) => seq("import", field("path", $.identifier)),

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
        $.parameter_list,
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
        $.comptime_expression,
        $.quote_expression,
        $.splice_expression,
        $.call_expression,
        $.ufcs_expression,
        $.applied_identifier,
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
        $.pattern,
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
    _string_content: ($) => /[^"\\]+/,
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

    comptime_expression: ($) => prec(PREC.CALL, seq("comptime", $._expression)),
    quote_expression: ($) => seq("<[", $._expression, "]>"),
    splice_expression: ($) => prec(PREC.UNARY, seq("~", $._expression)),

    call_expression: ($) =>
      prec(PREC.CALL, seq(field("function", $._expression), $.argument_list)),

    applied_identifier: ($) =>
      prec.left(PREC.CALL, seq(field("fn", $.identifier),
        repeat1(field("arg", choice($.identifier, $.integer, $.float, $.string, $.boolean, $.unit))))),

    argument_list: ($) => seq("(", commaSep($._expression), ")"),

    ufcs_expression: ($) =>
      prec(PREC.CALL, seq(field("receiver", $._expression), ".", field("method", $.identifier), $.argument_list)),

    cons_expression: ($) =>
      prec.right(
        PREC.CONS,
        seq(field("head", $._expression), "::", field("tail", $._expression)),
      ),

    binary_expression: ($) =>
      choice(
        prec.left(PREC.PIPE, seq($._expression, "|>", $._expression)),
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

    match_arm: ($) => seq("|", field("pattern", $.pattern), "->", field("body", $._expression)),

    if_expression: ($) =>
      seq(
        "if",
        field("condition", $._expression),
        field("then", $.block),
        optional(seq("else", field("else", choice($.block, $.if_expression)))),
      ),

    try_expression: ($) =>
      seq(
        "try",
        field("body", $._expression),
        "with",
        repeat1($.handler_arm),
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

    block: ($) => seq("{", repeat(choice($._statement, $._expression)), "}"),

    record_literal: ($) => seq("{",
      commaSep(seq(field("name", $.identifier), "=", field("value", $._expression))),
      "}"),

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
          repeat1(field("arg", choice($.identifier, $.wildcard_pattern))),
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
        $.local_type,
        $.mode_type,
      ),

    // Lowercase abstract type names, e.g. interface member `t` in `(a: t)`.
    type_variable: ($) => $.identifier,

    type_identifier: ($) => /[A-Z][a-zA-Z0-9_]*/,

    generic_type: ($) =>
      prec(PREC.CALL, seq(field("constructor", $.type_identifier), "<", commaSep($._type), ">")),

    unit_type: ($) => "Unit",

    tuple_type: ($) => prec(-1, seq("(", commaSep($._type), ")")),

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
      choice("unique", "once", "many", "aliased", "global",
        "portable", "frozen", "shared", "contended"),
      $._type)),

    comment_line: ($) => token(prec(PREC.COMMENT, seq("//", /[^\n]*/))),
  },
});

function commaSep(rule) {
  return optional(commaSep1(rule));
}

function commaSep1(rule) {
  return seq(rule, repeat(seq(",", rule)));
}
