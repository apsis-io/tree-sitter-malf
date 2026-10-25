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
      )),

    effect_declaration: ($) =>
      seq("effect", field("name", $.type_identifier), "::", $._type),

    function_declaration: ($) =>
      seq(
        field("name", $.identifier),
        optional(field("type_params", $.type_parameters)),
        "::",
        repeat($.parameter_list),
        optional(field("effects", $.effect_row)),
        "->",
        field("return_type", $._type),
        field("body", $.block),
      ),

    type_parameters: ($) => seq("<", repeat1($.type_identifier), ">"),

    parameter_list: ($) =>
      seq("(", commaSep(seq(optional("local"), field("name", $.identifier), ":", field("type", $._type))), ")"),

    effect_row: ($) => seq("[", commaSep(choice($.type_identifier, $.hole)), "]"),

    type_declaration: ($) =>
      seq("type", field("name", $.type_identifier), optional(seq("=", choice($.type_identifier, $._type)))),

    interface_declaration: ($) =>
      seq("interface", field("name", $.type_identifier), optional(seq("{", repeat($._type_member), "}"))),

    _type_member: ($) => seq(field("name", $.identifier), ":", $._type),

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
        optional(field("mode", choice("local", "once"))),
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
        $.cons_expression,
        $.binary_expression,
        $.assignment,
        $.match_expression,
        $.if_expression,
        $.try_expression,
        $.block,
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
      prec.right(PREC.CALL, seq("perform", field("effect", $.type_identifier), optional($.argument_list))),

    continue_expression: ($) =>
      prec.right(PREC.CALL, seq("continue", field("continuation", $.identifier), optional($.argument_list))),

    comptime_expression: ($) => prec(PREC.CALL, seq("comptime", $._expression)),
    quote_expression: ($) => seq("<[", $._expression, "]>"),
    splice_expression: ($) => prec(PREC.UNARY, seq("~", $._expression)),

    call_expression: ($) =>
      prec(PREC.CALL, seq(field("function", $._expression), $.argument_list)),

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
        seq(field("name", $.identifier), ":=", field("value", $._expression)),
      ),

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

    _statement: ($) => choice($.let_statement, $.assignment),

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
      ),

    wildcard_pattern: ($) => "_",
    list_pattern: ($) => seq("[", commaSep($.pattern), "]"),
    cons_pattern: ($) => prec.right(PREC.CONS, seq(field("head", $.pattern), "::", field("tail", $.pattern))),
    typed_pattern: ($) =>
      prec(PREC.UNARY, seq("(", field("pat", $.pattern), ":", field("type", $._type), ")")),
    constructor_pattern: ($) =>
      seq(field("constructor", $.type_identifier), optional(seq("(", commaSep($.pattern), ")"))),

    // ============================ types ===================================

    _type: ($) =>
      choice(
        $.type_identifier,
        $.generic_type,
        $.unit_type,
        $.tuple_type,
        $.list_type,
        $.effect_arrow_type,
        $.local_type,
      ),

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

    comment_line: ($) => token(prec(PREC.COMMENT, seq("//", /[^\n]*/))),
  },
});

function commaSep(rule) {
  return optional(commaSep1(rule));
}

function commaSep1(rule) {
  return seq(rule, repeat(seq(",", rule)));
}
