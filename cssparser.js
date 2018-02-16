/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The compvarze set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

/*
Extremely simple css parser. Intended to be not more than what we need
and definitely not necessarily correct =).
*/

if (window.__800812_getParser) {
  console.warn('We cannot initialize our parser code because of a name collition');
} else {
  var stored = null;
  window.__800812_getParser = function() {
    if (stored == null) {
      stored = createParser();
    }
    return stored;
  };
  
  function createParser() {
    /** @unrestricted */
    function StyleNode() {
      /** @type {number} */
      this['start'] = 0;
      /** @type {number} */
      this['end'] = 0;
      /** @type {StyleNode} */
      this['previous'] = null;
      /** @type {StyleNode} */
      this['parent'] = null;
      /** @type {Array<StyleNode>} */
      this['rules'] = null;
      /** @type {string} */
      this['parsedCssText'] = '';
      /** @type {string} */
      this['cssText'] = '';
      /** @type {boolean} */
      this['atRule'] = false;
      /** @type {number} */
      this['type'] = 0;
      /** @type {string} */
      this['keyframesName'] = '';
      /** @type {string} */
      this['selector'] = '';
      /** @type {string} */
      this['parsedSelector'] = '';
    }


    // given a string of css, return a simple rule tree
    /**
     * @param {string} text
     * @return {StyleNode}
     */
    function parse(text) {
      text = clean(text);
      return parseCss(lex(text), text);
    }

    // remove stuff we don't care about that may hinder parsing
    /**
     * @param {string} cssText
     * @return {string}
     */
    function clean(cssText) {
      return cssText.replace(RX.comments, '').replace(RX.port, '');
    }

    // super simple {...} lexer that returns a node tree
    /**
     * @param {string} text
     * @return {StyleNode}
     */
    function lex(text) {
      var root = new StyleNode();
      root['start'] = 0;
      root['end'] = text.length
      var n = root;
      for (var i = 0, l = text.length; i < l; i++) {
        if (text[i] === OPEN_BRACE) {
          if (!n['rules']) {
            n['rules'] = [];
          }
          var p = n;
          var previous = p['rules'][p['rules'].length - 1] || null;
          n = new StyleNode();
          n['start'] = i + 1;
          n['parent'] = p;
          n['previous'] = previous;
          p['rules'].push(n);
        } else if (text[i] === CLOSE_BRACE) {
          n['end'] = i + 1;
          n = n['parent'] || root;
        }
      }
      return root;
    }

    // add selectors/cssText to node tree
    /**
     * @param {StyleNode} node
     * @param {string} text
     * @return {StyleNode}
     */
    function parseCss(node, text) {
      var t = text.substring(node['start'], node['end'] - 1);
      node['parsedCssText'] = node['cssText'] = t.trim();
      if (node['parent']) {
        var ss = node['previous'] ? node['previous']['end'] : node['parent']['start'];
        t = text.substring(ss, node['start'] - 1);
        t = _expandUnicodeEscapes(t);
        t = t.replace(RX.multipleSpaces, ' ');
        // TODO(sorvell): ad hoc; make selector include only after last ;
        // helps with mixin syntax
        t = t.substring(t.lastIndexOf(';') + 1);
        var s = node['parsedSelector'] = node['selector'] = t.trim();
        node['atRule'] = (s.indexOf(AT_START) === 0);
        // note, support a subset of rule types...
        if (node['atRule']) {
          if (s.indexOf(MEDIA_START) === 0) {
            node['type'] = types.MEDIA_RULE;
          } else if (s.match(RX.keyframesRule)) {
            node['type'] = types.KEYFRAMES_RULE;
            node['keyframesName'] =
              node['selector'].split(RX.multipleSpaces).pop();
          }
        } else {
          if (s.indexOf(VAR_START) === 0) {
            node['type'] = types.MIXIN_RULE;
          } else {
            node['type'] = types.STYLE_RULE;
          }
        }
      }
      var r$ = node['rules'];
      if (r$) {
        for (var i = 0, l = r$.length, r;
          (i < l) && (r = r$[i]); i++) {
          parseCss(r, text);
        }
      }
      return node;
    }

    /**
     * conversion of sort unicode escapes with spaces like `\33 ` (and longer) into
     * expanded form that doesn't require trailing space `\000033`
     * @param {string} s
     * @return {string}
     */
    function _expandUnicodeEscapes(s) {
      return s.replace(/\\([0-9a-f]{1,6})\s/gi, function () {
        var code = arguments[1],
          repeat = 6 - code.length;
        while (repeat--) {
          code = '0' + code;
        }
        return '\\' + code;
      });
    }

    /**
     * stringify parsed css.
     * @param {StyleNode} node
     * @param {boolean=} preserveProperties
     * @param {string=} text
     * @return {string}
     */
    function stringify(node, preserveProperties, text = '') {
      // calc rule cssText
      var cssText = '';
      if (node['cssText'] || node['rules']) {
        var r$ = node['rules'];
        if (r$ && !_hasMixinRules(r$)) {
          for (var i = 0, l = r$.length, r;
            (i < l) && (r = r$[i]); i++) {
            cssText = stringify(r, preserveProperties, cssText);
          }
        } else {
          cssText = preserveProperties ? node['cssText'] :
            removeCustomProps(node['cssText']);
          cssText = cssText.trim();
          if (cssText) {
            cssText = '  ' + cssText + '\n';
          }
        }
      }
      // emit rule if there is cssText
      if (cssText) {
        if (node['selector']) {
          text += node['selector'] + ' ' + OPEN_BRACE + '\n';
        }
        text += cssText;
        if (node['selector']) {
          text += CLOSE_BRACE + '\n\n';
        }
      }
      return text;
    }

    /**
     * @param {Array<StyleNode>} rules
     * @return {boolean}
     */
    function _hasMixinRules(rules) {
      var r = rules[0];
      return Boolean(r) && Boolean(r['selector']) && r['selector'].indexOf(VAR_START) === 0;
    }

    /**
     * @param {string} cssText
     * @return {string}
     */
    function removeCustomProps(cssText) {
      cssText = removeCustomPropAssignment(cssText);
      return removeCustomPropApply(cssText);
    }

    /**
     * @param {string} cssText
     * @return {string}
     */
    function removeCustomPropAssignment(cssText) {
      return cssText
        .replace(RX.customProp, '')
        .replace(RX.mixinProp, '');
    }

    /**
     * @param {string} cssText
     * @return {string}
     */
    function removeCustomPropApply(cssText) {
      return cssText
        .replace(RX.mixinApply, '')
        .replace(RX.varApply, '');
    }

    /** @enum {number} */
    var types = {
      STYLE_RULE: 1,
      KEYFRAMES_RULE: 7,
      MEDIA_RULE: 4,
      MIXIN_RULE: 1000
    }

    var OPEN_BRACE = '{';
    var CLOSE_BRACE = '}';

    // helper regexp's
    var RX = {
      comments: /\/\*[^*]*\*+([^/*][^*]*\*+)*\//gim,
      port: /@import[^;]*;/gim,
      customProp: /(?:^[^;\-\s}]+)?--[^;{}]*?:[^{};]*?(?:[;\n]|$)/gim,
      mixinProp: /(?:^[^;\-\s}]+)?--[^;{}]*?:[^{};]*?{[^}]*?}(?:[;\n]|$)?/gim,
      mixinApply: /@apply\s*\(?[^);]*\)?\s*(?:[;\n]|$)?/gim,
      varApply: /[^;:]*?:[^;]*?var\([^;]*\)(?:[;\n]|$)?/gim,
      keyframesRule: /^@[^\s]*keyframes/,
      multipleSpaces: /\s+/g
    }

    var VAR_START = '--';
    var MEDIA_START = '@media';
    var AT_START = '@';
    return function (csstext) {
      return parse(csstext);
    };
  }
}