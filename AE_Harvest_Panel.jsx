/*
    AE_Harvest_Panel.jsx
    --------------------
    Resource "harvest" rig for After Effects.

    Coins fly along an arc from an emitter point into a resource bar
    (or out of it, when spending). The bar pulses and a blurred glowing
    ring lights up around it (green on gain, red on spend).
    Everything is expression-driven and survives comp resizing:
      - the bar snaps ("magnets") to a chosen comp anchor (9-grid),
      - the collect point sticks to the bar,
      - the emitter point sticks to a comp anchor + offset.

    Two control nulls keep the UI clean:
      AEH_CTRL   - everyday knobs (flight feel, glow, colours, counter)
      AEH_SETUP  - set-once rig setup (anchors, offsets, coin count).
                   guide + shy, so it stays out of the way.

    Flights are triggered by MARKERS on the AEH_CTRL layer:
      marker comment "+100"  -> gain burst (green, value +100)
      marker comment "-50"   -> spend burst (red, coins fly out, value -50)

    Install: drop into
      C:\Program Files\Adobe\Adobe After Effects <ver>\Support Files\Scripts\ScriptUI Panels\
    then Window > AE_Harvest_Panel.jsx
*/

(function harvestPanel(thisObj) {

    var SCRIPT_NAME = "AE Harvest";

    // -------- layer names (expressions depend on these!) --------
    var N_CTRL    = "AEH_CTRL";
    var N_SETUP   = "AEH_SETUP";
    var N_BAR     = "AEH_BAR";
    var N_EMIT    = "AEH_EMIT";
    var N_EMITANC = "AEH_EMIT_ANCHOR"; // anchor-driven parent of AEH_EMIT
    var N_COLLECT = "AEH_COLLECT";
    var N_COLLANC = "AEH_COLLECT_ANCHOR"; // bar-driven parent of AEH_COLLECT
    var N_FLASH   = "AEH_FLASH";     // legacy name, removed on rebuild
    var N_GLOW    = "AEH_GLOW";      // blurred glowing ring around the bar
    var N_COUNTER = "AEH_COUNTER";
    var N_COIN    = "AEH_COIN_";     // prefix
    var N_COINSRC = "AEH_COIN_SRC";

    // Anchor sliders read 1..9 as a 3x3 grid, left-to-right, top-to-bottom:
    //   1 Top-Left      2 Top-Center      3 Top-Right
    //   4 Mid-Left      5 Center          6 Mid-Right
    //   7 Bottom-Left   8 Bottom-Center   9 Bottom-Right

    // coins auto-trail across ~60% of the flight (no user knob needed)
    var TRAIL = 0.6;


    // ================= parameters & defaults =================
    // One table per null: type + display name. DEFAULTS holds the shipped
    // values; "Save current as defaults" overwrites them via a sidecar file.

    var CTRL_PARAMS = [
        { t: "slider", n: "Coins" },
        { t: "slider", n: "Flight Time" },
        { t: "slider", n: "Arc Height" },
        { t: "slider", n: "Grow %" },
        { t: "slider", n: "Coin Scale" },
        { t: "check",  n: "Align Rotation" },
        { t: "slider", n: "Bar Scale" },
        { t: "slider", n: "Pulse Amount" },
        { t: "slider", n: "Pulse Time" },
        { t: "slider", n: "Glow Width" },
        { t: "slider", n: "Glow Roundness" },
        { t: "slider", n: "Glow Inner Roundness" },
        { t: "slider", n: "Glow Radius" },
        { t: "point",  n: "Glow Fit" },
        { t: "point",  n: "Glow Shift" },
        { t: "slider", n: "Glow Base" },
        { t: "slider", n: "Flash Amount" },
        { t: "color",  n: "Idle Color" },
        { t: "color",  n: "Gain Color" },
        { t: "color",  n: "Spend Color" },
        { t: "slider", n: "Counter Start" },
        { t: "slider", n: "Value per Burst" }
    ];

    // "anchor" = plain 1..9 slider (Top-Left .. Bottom-Right, reading rows
    // left-to-right). Deliberately NOT a Dropdown Menu Control: its
    // setPropertyParameters() silently fails on some AE builds, leaving a
    // 3-item menu behind -> "Value 5 out of range 1 to 3". A slider cannot.
    var SETUP_PARAMS = [
        { t: "anchor", n: "Bar Anchor" },
        { t: "point",  n: "Bar Offset" },
        { t: "anchor", n: "Emitter Anchor" },
        { t: "point",  n: "Emitter Offset" },
        { t: "anchor", n: "Collect Anchor" },
        { t: "point",  n: "Collect Offset" }
    ];

    var DEFAULTS = {
        // flight feel
        "Coins": 8,
        "Flight Time": 0.8,
        "Arc Height": 300,
        "Grow %": 12,
        "Coin Scale": 100,
        "Align Rotation": 0,
        // bar feedback
        "Bar Scale": 100,
        "Pulse Amount": 8,
        "Pulse Time": 0.3,
        // glow ring
        "Glow Width": 8,
        "Glow Roundness": 40,
        "Glow Inner Roundness": 20,
        "Glow Radius": 12,
        "Glow Fit": [0, 0],
        "Glow Shift": [0, 0],
        "Glow Base": 40,
        "Flash Amount": 100,
        "Idle Color": [1, 1, 1, 1], // resting glow; gain/spend blend in on hits
        "Gain Color": [0.2, 1, 0.35, 1],
        "Spend Color": [1, 0.22, 0.22, 1],
        // counter
        "Counter Start": 0,
        "Value per Burst": 100,
        // setup
        "Bar Anchor": 3,      // Top-Right
        "Bar Offset": [40, 40],
        "Emitter Anchor": 5,  // Center
        "Emitter Offset": [0, 0],
        "Collect Anchor": 5,  // Center of bar
        "Collect Offset": [0, 0]
    };

    var MATCH = {
        slider: "ADBE Slider Control",
        anchor: "ADBE Slider Control", // 1..9, see SETUP_PARAMS note
        point:  "ADBE Point Control",
        color:  "ADBE Color Control",
        check:  "ADBE Checkbox Control",
        menu:   "ADBE Dropdown Control" // legacy, only used to detect & migrate
    };

    // ---- sidecar defaults (userData, no admin rights needed) ----
    function prefsFile() {
        return new File(Folder.userData.fsName + "/AE_Harvest_defaults.json");
    }

    function loadDefaults() {
        var f = prefsFile();
        if (!f.exists) return;
        try {
            f.open("r");
            var s = f.read();
            f.close();
            var o = eval("(" + s + ")"); // our own file; ExtendScript has no JSON
            for (var k in o) if (o.hasOwnProperty(k)) DEFAULTS[k] = o[k];
        } catch (e) { /* corrupt prefs: fall back to shipped defaults */ }
    }

    function serialize(o) {
        var parts = [];
        for (var k in o) {
            if (!o.hasOwnProperty(k)) continue;
            var v = o[k];
            var sv = (v instanceof Array) ? ("[" + v.join(", ") + "]") : String(v);
            parts.push('  "' + k + '": ' + sv);
        }
        return "{\n" + parts.join(",\n") + "\n}";
    }

    // ================= helpers =================

    function getComp() {
        var c = app.project ? app.project.activeItem : null;
        if (!(c && c instanceof CompItem)) {
            alert(SCRIPT_NAME + ": open / select a composition first.");
            return null;
        }
        return c;
    }

    function findLayer(comp, name) {
        for (var i = 1; i <= comp.numLayers; i++) {
            if (comp.layer(i).name === name) return comp.layer(i);
        }
        return null;
    }

    function fxGroup(layer) { return layer.property("ADBE Effect Parade"); }
    function getFx(layer, name) {
        var g = fxGroup(layer);
        return g ? g.property(name) : null;
    }

    function removeFx(layer, names) {
        for (var i = 0; i < names.length; i++) {
            var f = getFx(layer, names[i]);
            if (f) { try { f.remove(); } catch (e) {} }
        }
    }

    // add one param if missing, seeded from DEFAULTS; never touches an
    // existing one, so user tweaks survive a re-run of step 1.
    function ensureParam(layer, spec) {
        var fx = getFx(layer, spec.n);
        if (fx) {
            // migrate anchors built by older versions as Dropdown Menu Control:
            // those can carry a broken 3-item menu, so rebuild them as sliders.
            if (spec.t === "anchor" && fx.matchName === MATCH.menu) {
                try { fx.remove(); } catch (e) { return fx; }
            } else {
                return fx;
            }
        }
        var dv = DEFAULTS[spec.n];
        fx = fxGroup(layer).addProperty(MATCH[spec.t] || MATCH.slider);
        fx.name = spec.n;
        fx = getFx(layer, spec.n);
        if (!fx) throw new Error("could not create the '" + spec.n + "' control");
        if (dv !== undefined && dv !== null) fx.property(1).setValue(dv);
        return fx;
    }

    function ctrlRef(name) {
        return 'thisComp.layer("' + N_CTRL + '").effect("' + name + '")(1)';
    }


    // ================= expressions =================
    // written for both engines (var only, no arrows).

    function exMarkerScan() {
        return [
            'var C = thisComp.layer("' + N_CTRL + '");',
            'var d = Math.max(0.05, C.effect("Flight Time")(1).value);',
            'var idx = effect("Coin Index")(1).value;',
            'var mk = C.marker;',
            'var mt = 0, amt = 0, found = false;',
            'for (var k = 1; k <= mk.numKeys; k++) {',
            '    if (mk.key(k).time <= time) {',
            '        mt = mk.key(k).time;',
            '        amt = parseFloat(mk.key(k).comment);',
            '        found = true;',
            '    } else { break; }',
            '}',
            'if (isNaN(amt) || amt == 0) amt = C.effect("Value per Burst")(1).value;',
            'var spend = amt < 0;',
            // sampled AT THE MARKER, not at `time`: Coins is animatable, and
            // reading it live would pop coins in and out mid-flight.
            'var n = Math.max(1, Math.round(C.effect("Coins")(1).valueAtTime(mt)));',
            'var live = idx < n;',
            'var stag = d / n * ' + TRAIL + ';',
            'var t0 = mt + idx * stag;',
            'var rawP = found ? clamp((time - t0) / d, 0, 1) : 0;',
            'var p = ease(rawP, 0, 1, 0, 1);'
        ].join("\n");
    }

    function exBezierPoints() {
        return [
            // toComp, not transform.position: AEH_EMIT is parented, so its
            // raw position is parent-relative and would land in the wrong place.
            'var EL = thisComp.layer("' + N_EMIT + '");',
            'var CL = thisComp.layer("' + N_COLLECT + '");',
            'var A = EL.toComp(EL.transform.anchorPoint);',
            'var B = CL.toComp(CL.transform.anchorPoint);',
            'var P0 = spend ? B : A;',
            'var P2 = spend ? A : B;',
            'var arc = C.effect("Arc Height")(1).value;',
            'var dv = [P2[0] - P0[0], P2[1] - P0[1]];',
            'var len = Math.sqrt(dv[0]*dv[0] + dv[1]*dv[1]);',
            'var perp = (len > 0) ? [-dv[1]/len, dv[0]/len] : [0, 0];',
            'var P1 = [(P0[0]+P2[0])/2 + perp[0]*arc, (P0[1]+P2[1])/2 + perp[1]*arc];'
        ].join("\n");
    }

    function exCoinPosition() {
        return exMarkerScan() + "\n" + exBezierPoints() + "\n" + [
            'var u = 1 - p;',
            '[u*u*P0[0] + 2*u*p*P1[0] + p*p*P2[0],',
            ' u*u*P0[1] + 2*u*p*P1[1] + p*p*P2[1]]'
        ].join("\n");
    }

    function exCoinScale() {
        return exMarkerScan() + "\n" + [
            'var g = clamp(C.effect("Grow %")(1).value, 1, 49) / 100;',
            'var s = C.effect("Coin Scale")(1).value;',
            'var f = 0;',
            'if (rawP > 0 && rawP < 1) {',
            '    if (rawP < g) f = rawP / g;',
            '    else if (rawP > 1 - g) f = (1 - rawP) / g;',
            '    else f = 1;',
            '}',
            '[s*f, s*f]'
        ].join("\n");
    }

    function exCoinOpacity() {
        return exMarkerScan() + "\n" +
            '(found && live && rawP > 0 && rawP < 1) ? 100 : 0;';
    }

    function exCoinRotation() {
        return exMarkerScan() + "\n" + [
            'if (C.effect("Align Rotation")(1).value < 0.5) { value; } else {',
            exBezierPoints(),
            '    var u = 1 - p;',
            '    var D = [2*u*(P1[0]-P0[0]) + 2*p*(P2[0]-P1[0]),',
            '             2*u*(P1[1]-P0[1]) + 2*p*(P2[1]-P1[1])];',
            '    radiansToDegrees(Math.atan2(D[1], D[0]));',
            '}'
        ].join("\n");
    }

    // bar magnet: snap flush to one of 9 comp anchors, then Bar Offset nudges
    // it INWARD (positive = into the comp) whichever corner is used.
    function exBarPosition() {
        return [
            'var S = thisComp.layer("' + N_SETUP + '");',
            'var a = clamp(Math.round(S.effect("Bar Anchor")(1).value), 1, 9);',
            'var off = S.effect("Bar Offset")(1).value;',
            'var r = sourceRectAtTime(time, false);',
            'var sx = Math.abs(transform.scale[0]) / 100;',
            'var sy = Math.abs(transform.scale[1]) / 100;',
            'var w = r.width * sx, h = r.height * sy;',
            'var ax = (transform.anchorPoint[0] - r.left) * sx;',
            'var ay = (transform.anchorPoint[1] - r.top) * sy;',
            'var col = (a - 1) % 3, row = Math.floor((a - 1) / 3);',
            'var fx = (col == 0) ? ax : ((col == 1) ? (thisComp.width - w)/2 + ax : thisComp.width - w + ax);',
            'var fy = (row == 0) ? ay : ((row == 1) ? (thisComp.height - h)/2 + ay : thisComp.height - h + ay);',
            'var sgx = (col == 2) ? -1 : 1;',
            'var sgy = (row == 2) ? -1 : 1;',
            '[fx + off[0]*sgx, fy + off[1]*sgy]'
        ].join("\n");
    }

    function exPulseScan() {
        return [
            'var C = thisComp.layer("' + N_CTRL + '");',
            'var d = Math.max(0.05, C.effect("Flight Time")(1).value);',
            'var pt = Math.max(0.05, C.effect("Pulse Time")(1).value);',
            'var mk = C.marker;',
            'var pulse = 0, pulseSpend = false;',
            'for (var k = 1; k <= mk.numKeys; k++) {',
            '    var tb = mk.key(k).time;',
            '    var amt = parseFloat(mk.key(k).comment);',
            '    if (isNaN(amt) || amt == 0) amt = C.effect("Value per Burst")(1).value;',
            '    var sp = amt < 0;',
            '    var n = Math.max(1, Math.round(C.effect("Coins")(1).valueAtTime(tb)));',
            '    var stag = d / n * ' + TRAIL + ';',
            '    for (var i = 0; i < n; i++) {',
            '        var ta = sp ? (tb + i*stag) : (tb + i*stag + d);',
            '        var dt = time - ta;',
            '        if (dt >= 0 && dt <= pt) {',
            '            var v2 = Math.sin(Math.PI * dt / pt);',
            '            if (v2 > pulse) { pulse = v2; pulseSpend = sp; }',
            '        }',
            '    }',
            '}'
        ].join("\n");
    }

    // Bar Scale resizes the bar from the controller; the layer's own Scale
    // stays the baseline, so hand-scaled artwork keeps working. Everything
    // that measures the bar (magnet, glow ring) reads this result, so they
    // follow the new size on their own.
    function exBarScale() {
        return exPulseScan() + "\n" + [
            'var amp = C.effect("Pulse Amount")(1).value / 100;',
            'var bs = C.effect("Bar Scale")(1).value / 100;',
            'value * bs * (1 + amp * pulse)'
        ].join("\n");
    }

    // At rest the ring is Idle Color; a hit blends Gain/Spend in by pulse
    // strength. Reading Gain Color at rest is what made the bar permanently
    // green even when nothing was being collected.
    function exFlashColor() {
        return exPulseScan() + "\n" + [
            'var idle = C.effect("Idle Color")(1).value;',
            'var hit = pulseSpend ? C.effect("Spend Color")(1).value',
            '                     : C.effect("Gain Color")(1).value;',
            'idle + (hit - idle) * pulse'
        ].join("\n");
    }

    function exGlowOpacity() {
        return exPulseScan() + "\n" + [
            'var base = C.effect("Glow Base")(1).value;',
            'var amp = C.effect("Flash Amount")(1).value;',
            'clamp(base + pulse * amp, 0, 100)'
        ].join("\n");
    }

    // ring OUTER rect: auto-fits the bar's box (comp space, follows scale).
    // NOTE: for a precomp bar the box covers ALL its content (an icon poking
    // out widens it), so Glow Fit trims/expands by hand. Negative = tighter.
    function exGlowOuterSize() {
        return [
            'var B = thisComp.layer("' + N_BAR + '");',
            'var C = thisComp.layer("' + N_CTRL + '");',
            'var r = B.sourceRectAtTime(time, false);',
            'var s = B.transform.scale.value;',
            'var fit = C.effect("Glow Fit")(1).value;',
            'var w = r.width  * Math.abs(s[0])/100 + fit[0];',
            'var h = r.height * Math.abs(s[1])/100 + fit[1];',
            '[Math.max(0, w), Math.max(0, h)]'
        ].join("\n");
    }

    // ring INNER rect: the outer box pulled in by Glow Width on every side.
    // Subtracted from the outer one (Merge Paths) to punch the hole, so the
    // inner edge gets its own roundness.
    function exGlowInnerSize() {
        return [
            'var B = thisComp.layer("' + N_BAR + '");',
            'var C = thisComp.layer("' + N_CTRL + '");',
            'var r = B.sourceRectAtTime(time, false);',
            'var s = B.transform.scale.value;',
            'var fit = C.effect("Glow Fit")(1).value;',
            'var gw = C.effect("Glow Width")(1).value;',
            'var w = r.width  * Math.abs(s[0])/100 + fit[0] - gw*2;',
            'var h = r.height * Math.abs(s[1])/100 + fit[1] - gw*2;',
            '[Math.max(0, w), Math.max(0, h)]'
        ].join("\n");
    }

    function exGlowPosition() {
        return [
            'var B = thisComp.layer("' + N_BAR + '");',
            'var C = thisComp.layer("' + N_CTRL + '");',
            'var r = B.sourceRectAtTime(time, false);',
            'var sh = C.effect("Glow Shift")(1).value;',
            'var c = B.toComp([r.left + r.width/2, r.top + r.height/2]);',
            '[c[0] + sh[0], c[1] + sh[1]]'
        ].join("\n");
    }

    // Drives AEH_COLLECT_ANCHOR, the shy PARENT of AEH_COLLECT. Same deal as
    // the emitter: the anchor keeps the point glued to the bar's box, while
    // AEH_COLLECT itself stays expression-free so it can be dragged/keyframed.
    function exCollectAnchorPosition() {
        return [
            'var B = thisComp.layer("' + N_BAR + '");',
            'var S = thisComp.layer("' + N_SETUP + '");',
            'var a = clamp(Math.round(S.effect("Collect Anchor")(1).value), 1, 9);',
            'var off = S.effect("Collect Offset")(1).value;',
            'var r = B.sourceRectAtTime(time, false);',
            'var col = (a - 1) % 3, row = Math.floor((a - 1) / 3);',
            'var lx = r.left + r.width  * (col / 2);',
            'var ly = r.top  + r.height * (row / 2);',
            'var c = B.toComp([lx, ly]);',
            '[c[0] + off[0], c[1] + off[1]]'
        ].join("\n");
    }

    // Drives AEH_EMIT_ANCHOR, the shy PARENT of AEH_EMIT. The emitter itself
    // is left expression-free on purpose: the artist drags and keyframes it,
    // while this parent keeps it glued to the comp anchor across resizes.
    function exEmitAnchorPosition() {
        return [
            'var S = thisComp.layer("' + N_SETUP + '");',
            'var a = clamp(Math.round(S.effect("Emitter Anchor")(1).value), 1, 9);',
            'var off = S.effect("Emitter Offset")(1).value;',
            'var col = (a - 1) % 3, row = Math.floor((a - 1) / 3);',
            'var xs = [0, thisComp.width/2, thisComp.width];',
            'var ys = [0, thisComp.height/2, thisComp.height];',
            '[xs[col] + off[0], ys[row] + off[1]]'
        ].join("\n");
    }

    function exCounterText(compRef) {
        compRef = compRef || "thisComp";
        return [
            'var C = ' + compRef + '.layer("' + N_CTRL + '");',
            'var d = Math.max(0.05, C.effect("Flight Time")(1).value);',
            'var v = C.effect("Counter Start")(1).value;',
            'var mk = C.marker;',
            'for (var k = 1; k <= mk.numKeys; k++) {',
            '    var tb = mk.key(k).time;',
            '    var amt = parseFloat(mk.key(k).comment);',
            '    if (isNaN(amt) || amt == 0) amt = C.effect("Value per Burst")(1).value;',
            '    var n = Math.max(1, Math.round(C.effect("Coins")(1).valueAtTime(tb)));',
            '    var stag = d / n * ' + TRAIL + ';',
            '    var per = amt / n;',
            '    for (var i = 0; i < n; i++) {',
            '        var ta = (amt < 0) ? (tb + i*stag) : (tb + i*stag + d);',
            '        if (time >= ta) v += per;',
            '    }',
            '}',
            '"" + Math.round(v)'
        ].join("\n");
    }

    // ================= build steps =================

    function createController() {
        var comp = getComp();
        if (!comp) return;
        loadDefaults();
        app.beginUndoGroup(SCRIPT_NAME + ": controller");
        try {
            var ctrl = findLayer(comp, N_CTRL);
            if (!ctrl) {
                ctrl = comp.layers.addNull(comp.duration);
                ctrl.name = N_CTRL;
                ctrl.label = 14;
                ctrl.moveToBeginning();
            }
            for (var i = 0; i < CTRL_PARAMS.length; i++) ensureParam(ctrl, CTRL_PARAMS[i]);

            // carry an older rig's "Base Value" over to the clearer name
            var oldBase = getFx(ctrl, "Base Value");
            if (oldBase) {
                var cs = getFx(ctrl, "Counter Start");
                if (cs) cs.property(1).setValue(oldBase.property(1).value);
                removeFx(ctrl, ["Base Value"]);
            }

            // clear anything from older builds / params that moved to SETUP
            removeFx(ctrl, ["Bar Anchor", "Bar Margin", "Bar Margin X", "Bar Margin Y",
                "Bar Offset", "Emitter Anchor", "Emitter Offset", "Collect Anchor",
                "Collect Offset", "Stagger", "Coin Trail",
                "Flash Opacity", "Glow Size", "Glow Intensity"]);

            var setup = findLayer(comp, N_SETUP);
            if (!setup) {
                setup = comp.layers.addNull(comp.duration);
                setup.name = N_SETUP;
                setup.label = 8;
                setup.guideLayer = true;
                setup.shy = true;
                setup.moveAfter(ctrl);
            }
            for (var j = 0; j < SETUP_PARAMS.length; j++) ensureParam(setup, SETUP_PARAMS[j]);

            // Coins used to live here; move an older rig's value to AEH_CTRL,
            // where it is visible and can be keyframed.
            var oldCoins = getFx(setup, "Coins");
            if (oldCoins) {
                var cc = getFx(ctrl, "Coins");
                if (cc) cc.property(1).setValue(oldCoins.property(1).value);
                removeFx(setup, ["Coins"]);
            }
            comp.shyLayers = true;
        } catch (e) {
            alert(SCRIPT_NAME + " error: " + e.toString());
        }
        app.endUndoGroup();
    }

    function setupBar() {
        var comp = getComp();
        if (!comp) return;
        if (!findLayer(comp, N_CTRL) || !findLayer(comp, N_SETUP)) {
            alert(SCRIPT_NAME + ": create the controller first (step 1)."); return;
        }

        var bar = findLayer(comp, N_BAR);
        if (!bar) {
            if (comp.selectedLayers.length !== 1) {
                alert(SCRIPT_NAME + ": select exactly one layer to become the bar."); return;
            }
            bar = comp.selectedLayers[0];
            if (bar.name.indexOf("AEH_") === 0) {
                alert(SCRIPT_NAME + ": that is a rig layer, select your bar artwork."); return;
            }
        }

        app.beginUndoGroup(SCRIPT_NAME + ": bar");
        try {
            bar.name = N_BAR;
            if (bar.threeDLayer) bar.threeDLayer = false;
            var tr = bar.property("ADBE Transform Group");
            tr.property("ADBE Position").expression = exBarPosition();
            tr.property("ADBE Scale").expression = exBarScale();

            // Collect = free null riding a shy bar-driven parent, so it can be
            // dragged and keyframed while still following the bar.
            var cAnc = findLayer(comp, N_COLLANC);
            if (!cAnc) {
                cAnc = comp.layers.addNull(comp.duration);
                cAnc.name = N_COLLANC; cAnc.label = 8;
                cAnc.guideLayer = true; cAnc.shy = true;
            }
            cAnc.property("ADBE Transform Group").property("ADBE Position").expression = exCollectAnchorPosition();

            var col = findLayer(comp, N_COLLECT);
            if (!col) {
                col = comp.layers.addNull(comp.duration);
                col.name = N_COLLECT; col.label = 11;
            }
            col.guideLayer = true;
            col.shy = false;
            var cp = col.property("ADBE Transform Group").property("ADBE Position");
            cp.expression = "";            // hand-placeable + keyframable
            col.parent = cAnc;
            if (cp.numKeys === 0) cp.setValue([0, 0]); // sit on the anchor; keep any animation
            col.moveBefore(cAnc);

            // Emitter = free null riding a shy anchor-driven parent, so it can
            // be dragged and keyframed while still surviving comp resizes.
            var eAnc = findLayer(comp, N_EMITANC);
            if (!eAnc) {
                eAnc = comp.layers.addNull(comp.duration);
                eAnc.name = N_EMITANC; eAnc.label = 8;
                eAnc.guideLayer = true; eAnc.shy = true;
            }
            eAnc.property("ADBE Transform Group").property("ADBE Position").expression = exEmitAnchorPosition();

            var emit = findLayer(comp, N_EMIT);
            if (!emit) {
                emit = comp.layers.addNull(comp.duration);
                emit.name = N_EMIT; emit.label = 11;
            }
            var ep = emit.property("ADBE Transform Group").property("ADBE Position");
            ep.expression = "";           // hand-placeable + keyframable
            emit.parent = eAnc;
            if (ep.numKeys === 0) ep.setValue([0, 0]); // sit on the anchor; keep any animation
            emit.moveBefore(eAnc);

            // ---- blurred glowing RING around the bar ----
            // outer rect + inner rect, XOR'd via Merge Paths -> a true ring
            // whose inner edge has its own roundness. Filled, blurred, ADD.
            var oldF = findLayer(comp, N_FLASH); if (oldF) oldF.remove();
            var oldG = findLayer(comp, N_GLOW);  if (oldG) oldG.remove();

            var glow = comp.layers.addShape();
            glow.name = N_GLOW;
            glow.blendingMode = BlendingMode.ADD;
            var grp = glow.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
            grp.name = "GlowRing";
            var gVec = grp.property("ADBE Vectors Group");

            // NOTE: addProperty() invalidates sibling references, so every
            // shape property is configured right after it is added.
            var outer = gVec.addProperty("ADBE Vector Shape - Rect");
            outer.property("ADBE Vector Rect Size").expression = exGlowOuterSize();
            outer.property("ADBE Vector Rect Roundness").expression = ctrlRef("Glow Roundness");

            var inner = gVec.addProperty("ADBE Vector Shape - Rect");
            inner.property("ADBE Vector Rect Size").expression = exGlowInnerSize();
            inner.property("ADBE Vector Rect Roundness").expression = ctrlRef("Glow Inner Roundness");

            var merge = gVec.addProperty("ADBE Vector Filter - Merge");
            merge.property("ADBE Vector Merge Type").setValue(5); // Exclude Intersections

            var fill = gVec.addProperty("ADBE Vector Graphic - Fill");
            fill.property("ADBE Vector Fill Color").expression = exFlashColor();

            var gt = glow.property("ADBE Transform Group");
            gt.property("ADBE Position").expression = exGlowPosition();
            gt.property("ADBE Opacity").expression = exGlowOpacity();

            var blur = fxGroup(glow).addProperty("ADBE Box Blur2");
            blur.name = "Glow Blur";
            blur = getFx(glow, "Glow Blur");
            blur.property("Blur Radius").expression = ctrlRef("Glow Radius");
            try { blur.property("Repeat Edge Pixels").setValue(1); } catch (eB) {}

            glow.moveAfter(findLayer(comp, N_BAR)); // behind the bar

            // Rebuilding the rig changes how coins must read the endpoints
            // (e.g. parenting made positions parent-relative), so refresh any
            // existing flock right here instead of relying on a manual step 3.
            var tpl = findLayer(comp, N_COINSRC);
            if (tpl) coinsFrom(comp, tpl);
        } catch (e) {
            alert(SCRIPT_NAME + " error: " + e.toString());
        }
        app.endUndoGroup();
    }

    // rig must exist before coins can reference it
    function coinsReady(comp) {
        if (!findLayer(comp, N_CTRL) || !findLayer(comp, N_SETUP)) {
            alert(SCRIPT_NAME + ": create the controller first (step 1)."); return false;
        }
        if (!findLayer(comp, N_EMIT) || !findLayer(comp, N_COLLECT)) {
            alert(SCRIPT_NAME + ": set up the bar first (step 2)."); return false;
        }
        return true;
    }

    // core: turn `src` into the hidden coin template and (re)spawn the flock
    // Coins is animatable, but coin layers are physical duplicates that cannot
    // appear mid-render. So build a pool big enough for the busiest burst:
    // sample Coins at every marker and take the max (never below the current
    // value, for a rig with no markers yet).
    function coinPoolSize(ctrl) {
        var fx = getFx(ctrl, "Coins");
        if (!fx) throw new Error("AEH_CTRL has no 'Coins' control - re-run step 1.");
        var p = fx.property(1);
        var maxN = Math.round(p.value);
        var mk = ctrl.property("ADBE Marker");
        for (var k = 1; k <= mk.numKeys; k++) {
            var v = Math.round(p.valueAtTime(mk.keyTime(k), false));
            if (v > maxN) maxN = v;
        }
        return Math.max(1, Math.min(200, maxN));
    }

    function coinsFrom(comp, src) {
        var ctrl = findLayer(comp, N_CTRL);
        src.name = N_COINSRC;
        src.enabled = false;
        src.shy = true;

        for (var i = comp.numLayers; i >= 1; i--) {
            var nm = comp.layer(i).name;
            if (nm.indexOf(N_COIN) === 0 && nm !== N_COINSRC) comp.layer(i).remove();
        }

        var n = coinPoolSize(ctrl);
        for (var c = 0; c < n; c++) {
            var dcoin = src.duplicate();
            dcoin.name = N_COIN + (c + 1);
            dcoin.enabled = true;
            dcoin.shy = false;
            var sl = getFx(dcoin, "Coin Index");
            if (!sl) {
                sl = fxGroup(dcoin).addProperty("ADBE Slider Control");
                sl.name = "Coin Index";
                sl = getFx(dcoin, "Coin Index");
            }
            sl.property(1).setValue(c);
            var tr = dcoin.property("ADBE Transform Group");
            tr.property("ADBE Position").expression = exCoinPosition();
            tr.property("ADBE Scale").expression = exCoinScale();
            tr.property("ADBE Opacity").expression = exCoinOpacity();
            tr.property("ADBE Rotate Z").expression = exCoinRotation();
            dcoin.moveAfter(findLayer(comp, N_CTRL));
        }
    }

    // one-click artwork swap: pick a file, it becomes the coin. No layer
    // juggling, no rebuild step - import, replace the template, respawn.
    function replaceCoinArt() {
        var comp = getComp();
        if (!comp) return;
        if (!coinsReady(comp)) return;

        var f = File.openDialog("Pick the new coin artwork (PNG / PSD / AI / footage)");
        if (!f) return;

        app.beginUndoGroup(SCRIPT_NAME + ": replace coin");
        try {
            var item = app.project.importFile(new ImportOptions(f));
            var lay = comp.layers.add(item);
            var old = findLayer(comp, N_COINSRC);
            if (old) old.remove();
            coinsFrom(comp, lay);
        } catch (e) {
            alert(SCRIPT_NAME + " error: " + e.toString());
        }
        app.endUndoGroup();
    }

    function buildCoins() {
        var comp = getComp();
        if (!comp) return;
        if (!coinsReady(comp)) return;

        var src = null;
        if (comp.selectedLayers.length === 1 &&
            comp.selectedLayers[0].name.indexOf("AEH_") !== 0) {
            src = comp.selectedLayers[0];
        } else {
            src = findLayer(comp, N_COINSRC);
        }
        if (!src) { alert(SCRIPT_NAME + ": select the coin artwork layer."); return; }

        app.beginUndoGroup(SCRIPT_NAME + ": coins");
        try {
            coinsFrom(comp, src);
        } catch (e) {
            alert(SCRIPT_NAME + " error: " + e.toString());
        }
        app.endUndoGroup();
    }

    function createCounter() {
        var comp = getComp();
        if (!comp) return;
        var ctrl = findLayer(comp, N_CTRL);
        var bar = findLayer(comp, N_BAR);
        if (!ctrl || !bar) { alert(SCRIPT_NAME + ": run steps 1 and 2 first."); return; }

        app.beginUndoGroup(SCRIPT_NAME + ": counter");
        try {
            var t = findLayer(comp, N_COUNTER);
            if (!t) {
                t = comp.layers.addText("0");
                t.name = N_COUNTER;
                var doc = t.property("ADBE Text Properties").property("ADBE Text Document").value;
                doc.fontSize = 60;
                doc.fillColor = [1, 1, 1];
                doc.justification = ParagraphJustification.CENTER_JUSTIFY;
                t.property("ADBE Text Properties").property("ADBE Text Document").setValue(doc);
                t.parent = bar;
                var r = bar.sourceRectAtTime(0, false);
                t.property("ADBE Transform Group").property("ADBE Position")
                    .setValue([r.left + r.width / 2, r.top + r.height / 2 + 20]);
            }
            t.property("ADBE Text Properties").property("ADBE Text Document").expression = exCounterText();
            t.moveBefore(bar);
        } catch (e) {
            alert(SCRIPT_NAME + " error: " + e.toString());
        }
        app.endUndoGroup();
    }

    function findController(fromComp) {
        if (findLayer(fromComp, N_CTRL)) return { compRef: "thisComp", comp: fromComp };
        for (var i = 1; i <= app.project.numItems; i++) {
            var it = app.project.item(i);
            if (it instanceof CompItem && it.id !== fromComp.id && findLayer(it, N_CTRL)) {
                return { compRef: 'comp("' + it.name.replace(/"/g, '\\"') + '")', comp: it };
            }
        }
        return null;
    }

    function linkCounter() {
        var comp = getComp();
        if (!comp) return;
        if (comp.selectedLayers.length !== 1 || !(comp.selectedLayers[0] instanceof TextLayer)) {
            alert(SCRIPT_NAME + ": select exactly one existing text layer (your counter) first."); return;
        }
        var t = comp.selectedLayers[0];
        var found = findController(comp);
        if (!found) { alert(SCRIPT_NAME + ": couldn't find AEH_CTRL - run step 1 first."); return; }

        app.beginUndoGroup(SCRIPT_NAME + ": link counter");
        try {
            var td = t.property("ADBE Text Properties").property("ADBE Text Document");
            var cur = parseFloat(String(td.value.text).replace(/[^0-9.\-]/g, ""));
            var bv = getFx(findLayer(found.comp, N_CTRL), "Counter Start");
            if (!isNaN(cur) && bv) bv.property(1).setValue(cur);
            td.expression = exCounterText(found.compRef);
        } catch (e) {
            alert(SCRIPT_NAME + " error: " + e.toString());
        }
        app.endUndoGroup();
    }

    function addBurstMarker(isSpend) {
        var comp = getComp();
        if (!comp) return;
        var ctrl = findLayer(comp, N_CTRL);
        if (!ctrl) { alert(SCRIPT_NAME + ": create the controller first (step 1)."); return; }

        var s = prompt("Amount for this burst:", "100");
        if (s === null) return;
        var amt = parseFloat(s);
        if (isNaN(amt) || amt === 0) { alert(SCRIPT_NAME + ": enter a non-zero number."); return; }
        amt = isSpend ? -Math.abs(amt) : Math.abs(amt);

        app.beginUndoGroup(SCRIPT_NAME + ": marker");
        try {
            ctrl.property("ADBE Marker").setValueAtTime(comp.time, new MarkerValue(String(amt)));
        } catch (e) {
            alert(SCRIPT_NAME + " error: " + e.toString());
        }
        app.endUndoGroup();
    }

    // read the current rig's values and make them the defaults for every
    // rig built from now on (stored next to the AE prefs, no admin needed).
    function saveAsDefaults() {
        var comp = getComp();
        if (!comp) return;
        var ctrl = findLayer(comp, N_CTRL);
        var setup = findLayer(comp, N_SETUP);
        if (!ctrl || !setup) { alert(SCRIPT_NAME + ": no rig in this comp - run step 1 first."); return; }

        var out = {}, i, fx;
        for (i = 0; i < CTRL_PARAMS.length; i++) {
            fx = getFx(ctrl, CTRL_PARAMS[i].n);
            if (fx) out[CTRL_PARAMS[i].n] = fx.property(1).value;
        }
        for (i = 0; i < SETUP_PARAMS.length; i++) {
            fx = getFx(setup, SETUP_PARAMS[i].n);
            if (fx) out[SETUP_PARAMS[i].n] = fx.property(1).value;
        }
        try {
            var f = prefsFile();
            f.open("w");
            f.write(serialize(out));
            f.close();
            for (var k in out) if (out.hasOwnProperty(k)) DEFAULTS[k] = out[k];
            alert(SCRIPT_NAME + ": saved as defaults.\n" + f.fsName);
        } catch (e) {
            alert(SCRIPT_NAME + " error: " + e.toString());
        }
    }

    // ================= UI =================

    function buildUI(thisObj) {
        var pal = (thisObj instanceof Panel)
            ? thisObj
            : new Window("palette", SCRIPT_NAME, undefined, { resizeable: true });

        pal.orientation = "column";
        pal.alignChildren = ["fill", "top"];
        pal.spacing = 6;
        pal.margins = 12;

        var gBuild = pal.add("panel", undefined, "Build");
        gBuild.orientation = "column";
        gBuild.alignChildren = ["fill", "top"];
        gBuild.margins = 10;

        var b1 = gBuild.add("button", undefined, "1. Create / update controller");
        var b2 = gBuild.add("button", undefined, "2. Selected layer -> BAR (magnet + glow)");
        var b3 = gBuild.add("button", undefined, "3. Selected layer -> coins (build / rebuild)");
        var b4 = gBuild.add("button", undefined, "4. Create NEW counter text");
        var b5 = gBuild.add("button", undefined, "5. Link SELECTED text -> counter");

        var gMark = pal.add("panel", undefined, "Bursts (markers on AEH_CTRL)");
        gMark.orientation = "row";
        gMark.alignChildren = ["fill", "top"];
        gMark.margins = 10;

        var bGain = gMark.add("button", undefined, "+ GAIN");
        var bSpend = gMark.add("button", undefined, "- SPEND");
        bGain.preferredSize.width = 90;
        bSpend.preferredSize.width = 90;

        var gArt = pal.add("panel", undefined, "Artwork");
        gArt.orientation = "column";
        gArt.alignChildren = ["fill", "top"];
        gArt.margins = 10;
        var bCoin = gArt.add("button", undefined, "Replace coin artwork...");

        var gPre = pal.add("panel", undefined, "Presets");
        gPre.orientation = "column";
        gPre.alignChildren = ["fill", "top"];
        gPre.margins = 10;
        var bSave = gPre.add("button", undefined, "Save current as defaults");

        var help = pal.add("statictext", undefined,
            "Markers: '+100' = gain (green), '-50' = spend (red).\n" +
            "Spend reverses the flight: coins leave AEH_COLLECT for AEH_EMIT.\n" +
            "AEH_EMIT and AEH_COLLECT are plain nulls - drag / keyframe both.\n" +
            "Everyday knobs are on AEH_CTRL; setup is on the shy AEH_SETUP.\n" +
            "Anchor sliders are a 3x3 grid, 1..9: 1 = top-left, 5 = center,\n" +
            "9 = bottom-right.\n" +
            "Counter's starting number = 'Counter Start' on AEH_CTRL.\n" +
            "'Coins' (AEH_CTRL) is keyframable - it is read at each marker, so\n" +
            "bursts can differ. Raised it past the built flock? Re-run step 3.\n" +
            "Swap the coin any time: 'Replace coin artwork...' - pick a file,\n" +
            "it imports and respawns the coins by itself.\n" +
            "Have a styled counter already? Select it, use step 5.",
            { multiline: true });
        help.preferredSize.height = 134;

        b1.onClick = createController;
        b2.onClick = setupBar;
        b3.onClick = buildCoins;
        b4.onClick = createCounter;
        b5.onClick = linkCounter;
        bGain.onClick = function () { addBurstMarker(false); };
        bSpend.onClick = function () { addBurstMarker(true); };
        bCoin.onClick = replaceCoinArt;
        bSave.onClick = saveAsDefaults;

        pal.layout.layout(true);
        pal.onResizing = pal.onResize = function () { this.layout.resize(); };

        if (pal instanceof Window) { pal.center(); pal.show(); }
        return pal;
    }

    loadDefaults();
    buildUI(thisObj);

})(this);
