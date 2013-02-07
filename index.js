module = {};
var global = {};

//     Fiber.js 1.0.5
//     @author: Kirollos Risk
//
//     Copyright (c) 2012 LinkedIn.
//     All Rights Reserved. Apache Software License 2.0
//     http://www.apache.org/licenses/LICENSE-2.0

(function () {
  /*jshint bitwise: true, camelcase: false, curly: true, eqeqeq: true,
    forin: false, immed: true, indent: 2, latedef: true, newcap: false,
    noarg: true, noempty: false, nonew: true, plusplus: false,
    quotmark: single, regexp: false, undef: true, unused: true, strict: false,
    trailing: true, asi: false, boss: false, debug: false, eqnull: true,
    es5: false, esnext: false, evil: true, expr: false, funcscope: false,
    iterator: false, lastsemic: false, laxbreak: false, laxcomma: false,
    loopfunc: false, multistr: true, onecase: false, proto: false,
    regexdash: false, scripturl: false, smarttabs: false, shadow: true,
    sub: true, supernew: true, validthis: false */

  /*global exports, global, define, module */

  (function (root, factory) {
    var module = {};
    if (typeof exports === 'object') {
      // Node. Does not work with strict CommonJS, but
      // only CommonJS-like environments that support module.exports,
      // like Node.
      module.exports = factory(this);
    } else if (typeof define === 'function' && define.amd) {
      // AMD. Register as an anonymous module.
      define(function () {
        return factory(root);
      });
    } else {
      // Browser globals (root is window)
      root.Fiber = factory(root);
    }
  }(this, function (global) {

    // Baseline setup
    // --------------

    // Stores whether the object is being initialized. i.e., whether
    // to run the `init` function, or not.
    var initializing = false,

    // Keep a few prototype references around - for speed access,
    // and saving bytes in the minified version.
    ArrayProto = Array.prototype,

    // Save the previous value of `Fiber`.
    previousFiber = global.Fiber;

    // Helper function to copy properties from one object to the other.
    function copy(from, to) {
      var name;
      for (name in from) {
        if (from.hasOwnProperty(name)) {
          to[name] = from[name];
        }
      }
    }

    // The base `Fiber` implementation.
    function Fiber() {}

    // ###Extend
    //
    // Returns a subclass.
    Fiber.extend = function (fn) {
      // Keep a reference to the current prototye.
      var parent = this.prototype,

      // Invoke the function which will return an object literal used to
      // define the prototype. Additionally, pass in the parent prototype,
      // which will allow instances to use it.
      properties = fn(parent),

      // Stores the constructor's prototype.
      proto;

      // The constructor function for a subclass.
      function child() {
        if (!initializing) {
          // Custom initialization is done in the `init` method.
          this.init.apply(this, arguments);
          // Prevent subsequent calls to `init`. Note: although a `delete
          // this.init` would remove the `init` function from the instance, it
          // would still exist in its super class' prototype.  Therefore,
          // explicitly set `init` to `void 0` to obtain the `undefined`
          // primitive value (in case the global's `undefined` property has
          // been re-assigned).
          this.init = void 0;
        }
      }

      // Instantiate a base class (but only create the instance, without
      // running `init`). And, make every `constructor` instance an instance
      // of `this` and of `constructor`.
      initializing = true;
      proto = child.prototype = new this;
      initializing = false;

      // Add default `init` function, which a class may override; it should
      // call the super class' `init` function (if it exists);
      proto.init = function () {
        if (typeof parent.init === 'function') {
          parent.init.apply(this, arguments);
        }
      };

       // Copy the properties over onto the new prototype.
      copy(properties, proto);

      // Enforce the constructor to be what we expect.
      proto.constructor = child;

      // Keep a reference to the parent prototype.
      // (Note: currently used by decorators and mixins, so that the parent
      // can be inferred).
      child.__base__ = parent;

      // Make this class extendable, this can be overridden by providing a
      // custom extend method on the proto.
      child.extend = child.prototype.extend || Fiber.extend;


      return child;
    };

    // Utilities
    // ---------

    // ###Proxy
    //
    // Returns a proxy object for accessing base methods with a given context.
    //
    // - `base`: the instance' parent class prototype.
    // - `instance`: a Fiber class instance.
    //
    // Overloads:
    //
    // - `Fiber.proxy( instance )`
    // - `Fiber.proxy( base, instance )`
    //
    Fiber.proxy = function (base, instance) {
      var name,
        iface = {},
        wrap;

      // If there's only 1 argument specified, then it is the instance,
      // thus infer `base` from its constructor.
      if (arguments.length === 1) {
        instance = base;
        base = instance.constructor.__base__;
      }

      // Returns a function which calls another function with `instance` as
      // the context.
      wrap = function (fn) {
        return function () {
          return base[fn].apply(instance, arguments);
        };
      };

      // For each function in `base`, create a wrapped version.
      for (name in base) {
        if (base.hasOwnProperty(name) && typeof base[name] === 'function') {
          iface[name] = wrap(name);
        }
      }
      return iface;
    };

    // ###Decorate
    //
    // Decorate an instance with given decorator(s).
    //
    // - `instance`: a Fiber class instance.
    // - `decorator[s]`: the argument list of decorator functions.
    //
    // Note: when a decorator is executed, the argument passed in is the super
    // class' prototype, and the context (i.e. the `this` binding) is the
    // instance.
    //
    //  *Example usage:*
    //
    //     function Decorator( base ) {
    //       // this === obj
    //       return {
    //         greet: function() {
    //           console.log('hi!');
    //         }
    //       };
    //     }
    //
    //     var obj = new Bar(); // Some instance of a Fiber class
    //     Fiber.decorate(obj, Decorator);
    //     obj.greet(); // hi!
    //
    Fiber.decorate = function (instance /*, decorator[s] */) {
      var i,
        // Get the base prototype.
        base = instance.constructor.__base__,
        // Get all the decorators in the arguments.
        decorators = ArrayProto.slice.call(arguments, 1),
        len = decorators.length;

      for (i = 0; i < len; i++) {
        copy(decorators[i].call(instance, base), instance);
      }
    };

    // ###Mixin
    //
    // Add functionality to a Fiber definition
    //
    // - `definition`: a Fiber class definition.
    // - `mixin[s]`: the argument list of mixins.
    //
    // Note: when a mixing is executed, the argument passed in is the super
    // class' prototype (i.e., the base)
    //
    // Overloads:
    //
    // - `Fiber.mixin( definition, mix_1 )`
    // - `Fiber.mixin( definition, mix_1, ..., mix_n )`
    //
    // *Example usage:*
    //
    //     var Definition = Fiber.extend(function(base) {
    //       return {
    //         method1: function(){}
    //       }
    //     });
    //
    //     function Mixin(base) {
    //       return {
    //         method2: function(){}
    //       }
    //     }
    //
    //     Fiber.mixin(Definition, Mixin);
    //     var obj = new Definition();
    //     obj.method2();
    //
    Fiber.mixin = function (definition /*, mixin[s] */) {
      var i,
        // Get the base prototype.
        base = definition.__base__,
        // Get all the mixins in the arguments.
        mixins = ArrayProto.slice.call(arguments, 1),
        len = mixins.length;

      for (i = 0; i < len; i++) {
        copy(mixins[i](base), definition.prototype);
      }
    };

    // ###noConflict
    //
    // Run Fiber.js in *noConflict* mode, returning the `fiber` variable to
    // its previous owner. Returns a reference to the Fiber object.
    Fiber.noConflict = function () {
      global.Fiber = previousFiber;
      return Fiber;
    };

    return Fiber;
  }));
} ());

function GUID()
{
   var S4 = function()
   {
       return Math.floor(
                         Math.random() * 0x10000 /* 65536 */
                         ).toString(16);
   };

   return (
           S4() + S4() + "-" +
           S4() + "-" +
           S4() + "-" +
           S4() + "-" +
           S4() + S4() + S4()
           );
}

//////////////////////////////////////////////////////////////////////////////////////////////
// Now we are in an area of... event API
//////////////////////////////////////////////////////////////////////////////////////////////
var heavyObjects = [];





// document.addEventListener( 'touchstart', function( ev ) {

//    eventHandeler(ev, 'touchstart');

// }, false );

// document.addEventListener( 'touchend', function( ev ) {

//    eventHandeler(ev, 'touchend');

// }, false );

// document.addEventListener( 'touchmove', function( ev ) {

//    eventHandeler(ev, 'touchmove');

// }, false );

// document.addEventListener( 'mousedown', function( ev ) {

//    eventHandeler(ev, 'touchstart');

// }, false );

// document.addEventListener( 'mouseup', function( ev ) {

//    eventHandeler(ev, 'touchend');

// }, false );

// document.addEventListener( 'mousemove', function( ev ) {

//    eventHandeler(ev, 'touchmove');

// }, false );


(function() {
  var CURRENT_TOUCH, FIRST_TOUCH, GESTURE, GESTURES, HOLD_DELAY, TAPS, TOUCH_TIMEOUT, _angle, _capturePinch, _captureRotation, _cleanGesture, _distance, _fingersPosition, _getTouches, _hold, _isSwipe, _listenTouches, _onTouchEnd, _onTouchMove, _onTouchStart, _parentIfText, _swipeDirection, _trigger;
  TAPS = undefined;
  GESTURE = {};
  FIRST_TOUCH = [];
  CURRENT_TOUCH = [];
  TOUCH_TIMEOUT = void 0;
  HOLD_DELAY = 650;
  BEING_TOUCHED = false;
  GESTURES = ["doubleTap", "hold", "swipe", "swiping", "swipeLeft", "swipeRight", "swipeUp", "swipeDown", "rotate", "rotating", "rotateLeft", "rotateRight", "pinch", "pinching", "pinchIn", "pinchOut", "drag", "dragLeft", "dragRight", "dragUp", "dragDown"];
  GESTURES.forEach(function(event) {
//
  });

  function childLooper(_children, ev, __callback) {
      for(var i in _children) {
          var child = _children[i];
          _targetVarification(child , ev, __callback);

          if(child.children.length > 0) {
              childLooper(child.children, ev, __callback);
          }
      }
  }

  function _touchLocator(ev, __callback) {
     // pageX is pt from left, pageY is pt from top
     if(heavyObjects.length > 0) {

          // create a copy so we dont corrupt the main "ui thread"
          var tempHeavyObjects = heavyObjects.slice();

          tempHeavyObjects.sort(UIIndexSorter);
          tempHeavyObjects.reverse();

         for(var i in tempHeavyObjects) {

              var currentHeavy = tempHeavyObjects[i];

             currentHeavy.children.sort(UIIndexSorter);
             currentHeavy.children.reverse();

             childLooper(currentHeavy.children, ev, __callback);
             _targetVarification(currentHeavy , ev, __callback);


         }

         tempHeavyObjects = undefined;
     }

  }

  function _targetVarification(__object , ev, __callback) {

         if(!ev.touches) {
            ev.touches = [{
                pageY: ev.y,
                pageX: ev.x
            }];
          }

          if(ev.touches[0]) {
              // first... is the touch on the right x axis
            if(ev.touches[0].pageX > __object.__frame.x && ev.touches[0].pageX < (__object.__frame.w + __object.__frame.x)) {

                // now we check if it was on the right y axes
                if(ev.touches[0].pageY > __object.__frame.y && ev.touches[0].pageY < (__object.__frame.h + __object.__frame.y)) {
                    // This child is being touched!!!! Call the police... I have such a messed up sense of humor
                    ev.touches[0].target = __object;
                    return __callback(ev);
                }
            }
          }
  }

  _onTouchStart = function(event) {

    var delta, fingers, now, touches;
    now = Date.now();
    delta = now - (GESTURE.last || now);
    TOUCH_TIMEOUT && clearTimeout(TOUCH_TIMEOUT);
    touches = _getTouches(event);
    fingers = touches.length;
    FIRST_TOUCH = _fingersPosition(touches, fingers);
    GESTURE.el = touches[0].target;

    GESTURE.fingers = fingers;
    GESTURE.last = now;
    if (!GESTURE.taps) {
      GESTURE.taps = 0;
    }
    GESTURE.taps++;
    if (fingers === 1) {
      if (fingers >= 1) {
        GESTURE.gap = delta > 0 && delta <= 250;
      }
      return setTimeout(_hold, HOLD_DELAY);
    } else if (fingers === 2) {
      GESTURE.initial_angle = parseInt(_angle(FIRST_TOUCH), 10);
      GESTURE.initial_distance = parseInt(_distance(FIRST_TOUCH), 10);
      GESTURE.angle_difference = 0;
      return GESTURE.distance_difference = 0;
    }
  };
  _onTouchMove = function(event) {
    var fingers, is_swipe, touches;
    if (GESTURE.el) {
      touches = _getTouches(event);
      fingers = touches.length;

      if (fingers === GESTURE.fingers) {
        CURRENT_TOUCH = _fingersPosition(touches, fingers);
        is_swipe = _isSwipe(event);
        if (is_swipe) {
          GESTURE.prevSwipe = true;
        }
        if (is_swipe || GESTURE.prevSwipe === true) {
          _trigger("swiping");
        }
        if (fingers === 2) {
          _captureRotation();
          _capturePinch();
        }
      } else {
        _cleanGesture();
      }
    }
    return true;
  };
  _isSwipe = function(event) {
    var it_is, move_horizontal, move_vertical;
    it_is = false;
    if (CURRENT_TOUCH[0]) {
      move_horizontal = Math.abs(FIRST_TOUCH[0].x - CURRENT_TOUCH[0].x) > 30;
      move_vertical = Math.abs(FIRST_TOUCH[0].y - CURRENT_TOUCH[0].y) > 30;
      it_is = GESTURE.el && (move_horizontal || move_vertical);
    }
    return it_is;
  };
  _onTouchEnd = function(event) {
    var anyevent, drag_direction, pinch_direction, rotation_direction, swipe_direction;
    if (GESTURE.fingers === 1) {
      console.log('one finger and ' + GESTURE.taps + ' taps');
      if (GESTURE.taps === 2 && GESTURE.gap) {
        _trigger("doubleTap");
        return _cleanGesture();
      } else if (_isSwipe() || GESTURE.prevSwipe) {
        _trigger("swipe");
        swipe_direction = _swipeDirection(FIRST_TOUCH[0].x, CURRENT_TOUCH[0].x, FIRST_TOUCH[0].y, CURRENT_TOUCH[0].y);
        _trigger("swipe" + swipe_direction);
        return _cleanGesture();
      } else {
        _trigger("tap");
        if (GESTURE.taps === 1) {
          return TOUCH_TIMEOUT = setTimeout((function() {
            _trigger("singleTap");
            return _cleanGesture();
          }), 100);
        }
      }
    } else {
      anyevent = false;
      if (GESTURE.angle_difference !== 0) {
        _trigger("rotate", {
          angle: GESTURE.angle_difference
        });
        rotation_direction = GESTURE.angle_difference > 0 ? "rotateRight" : "rotateLeft";
        _trigger(rotation_direction, {
          angle: GESTURE.angle_difference
        });
        anyevent = true;
      }
      if (GESTURE.distance_difference !== 0) {
        _trigger("pinch", {
          angle: GESTURE.distance_difference
        });
        pinch_direction = GESTURE.distance_difference > 0 ? "pinchOut" : "pinchIn";
        _trigger(pinch_direction, {
          distance: GESTURE.distance_difference
        });
        anyevent = true;
      }
      if (!anyevent && CURRENT_TOUCH[0]) {
        if (Math.abs(FIRST_TOUCH[0].x - CURRENT_TOUCH[0].x) > 10 || Math.abs(FIRST_TOUCH[0].y - CURRENT_TOUCH[0].y) > 10) {
          _trigger("drag");
          drag_direction = _swipeDirection(FIRST_TOUCH[0].x, CURRENT_TOUCH[0].x, FIRST_TOUCH[0].y, CURRENT_TOUCH[0].y);
          _trigger("drag" + drag_direction);
        }
      }
      return _cleanGesture();
    }
  };
  _fingersPosition = function(touches, fingers) {
    var i, result;
    result = [];
    i = 0;
    touches = touches[0].targetTouches ? touches[0].targetTouches : touches;
    while (i < fingers) {
      result.push({
        x: touches[i].pageX,
        y: touches[i].pageY
      });
      i++;
    }
    return result;
  };
  _captureRotation = function() {
    var angle, diff, i, symbol;
    angle = parseInt(_angle(CURRENT_TOUCH), 10);
    diff = parseInt(GESTURE.initial_angle - angle, 10);
    if (Math.abs(diff) > 20 || GESTURE.angle_difference !== 0) {
      i = 0;
      symbol = GESTURE.angle_difference < 0 ? "-" : "+";
      while (Math.abs(diff - GESTURE.angle_difference) > 90 && i++ < 10) {
        eval("diff " + symbol + "= 180;");
      }
      GESTURE.angle_difference = parseInt(diff, 10);
      return _trigger("rotating", {
        angle: GESTURE.angle_difference
      });
    }
  };
  _capturePinch = function() {
    var diff, distance;
    distance = parseInt(_distance(CURRENT_TOUCH), 10);
    diff = GESTURE.initial_distance - distance;
    if (Math.abs(diff) > 10) {
      GESTURE.distance_difference = diff;
      return _trigger("pinching", {
        distance: diff
      });
    }
  };
  _trigger = function(type, params) {
    console.log('trigger ' + type);
    if (GESTURE.el) {
      params = params || {};
      if (CURRENT_TOUCH[0]) {
        params.iniTouch = (GESTURE.fingers > 1 ? FIRST_TOUCH : FIRST_TOUCH[0]);
        params.currentTouch = (GESTURE.fingers > 1 ? CURRENT_TOUCH : CURRENT_TOUCH[0]);
      }
      return GESTURE.el.fireEvent(type, params);
    }
  };
  _cleanGesture = function(event) {
    FIRST_TOUCH = [];
    CURRENT_TOUCH = [];
    GESTURE = {};
    return clearTimeout(TOUCH_TIMEOUT);
  };
  _angle = function(touches_data) {
    var A, B, angle;
    A = touches_data[0];
    B = touches_data[1];
    angle = Math.atan((B.y - A.y) * -1 / (B.x - A.x)) * (180 / Math.PI);
    if (angle < 0) {
      return angle + 180;
    } else {
      return angle;
    }
  };
  _distance = function(touches_data) {
    var A, B;
    A = touches_data[0];
    B = touches_data[1];
    return Math.sqrt((B.x - A.x) * (B.x - A.x) + (B.y - A.y) * (B.y - A.y)) * -1;
  };
  _getTouches = function(event) {
    if (event.touches) {
      return event.touches;
    } else {
      return [event];
    }
  };
  _parentIfText = function(node) {
    if ("tagName" in node) {
      return node;
    } else {
      return node.parentNode;
    }
  };
  _swipeDirection = function(x1, x2, y1, y2) {
    var xDelta, yDelta;
    xDelta = Math.abs(x1 - x2);
    yDelta = Math.abs(y1 - y2);
    if (xDelta >= yDelta) {
      if (x1 - x2 > 0) {
        return "Left";
      } else {
        return "Right";
      }
    } else {
      if (y1 - y2 > 0) {
        return "Up";
      } else {
        return "Down";
      }
    }
  };

  _listenTouches = function() {

    document.addEventListener( 'touchstart', function(event) {
      _touchLocator(event, _onTouchStart);
    }, false );
    document.addEventListener( 'touchmove', function(event) {
      _touchLocator(event, _onTouchMove);
    }, false );
    document.addEventListener( 'touchend', function(event) {
      _onTouchEnd(event);
    }, false );
    document.addEventListener( 'touchclear', function(event) {
      _cleanGesture(event);
    }, false );


    document.addEventListener( 'mousedown', function(event) {
      BEING_TOUCHED = true;
      _touchLocator(event, _onTouchStart);
    }, false );
    document.addEventListener( 'mousemove', function(event) {
      if(BEING_TOUCHED) {
        _touchLocator(event, _onTouchMove);
      }
    }, false );
    document.addEventListener( 'mouseup', function(event) {
      BEING_TOUCHED = false;
      _onTouchEnd(event);
    }, false );
    document.addEventListener( 'mousecancel', function(event) {
      BEING_TOUCHED = false;
      _cleanGesture(event);
    }, false );

  };
  _listenTouches();


  _hold = function() {
    if (GESTURE.last && (Date.now() - GESTURE.last >= HOLD_DELAY)) {
      _trigger("hold");
      return GESTURE.taps = 0;
    }
  };
})();


//////////////////////////////////////////////////////////////////////////////////////////////
// Now we are in "my" code
//////////////////////////////////////////////////////////////////////////////////////////////

var UI = {};


Object.defineProperty(UI, "platformWidth", {
   get: function() { return document.width; }
});
Object.defineProperty(UI, "platformHeight", {
   get: function() { return document.height; }
});

var canvas = document.getElementById('canvas');
if(typeof canvas.width === undefined) {
   canvas.width = UI.platformWidth;
   canvas.height = UI.platformHeight;
}

UI.UIContext = canvas.getContext('2d');

function UIIndexSorter(a,b) {
 var x = a.zindex - b.zindex;
 return x === 0? a.__orderAdded - b.__orderAdded : x;
}
function drawObjects(__object, __forceDraw) {
    if(__object.clipEnabled) {
        UI.UIContext.save();
    }

    UI.UIContext.beginPath();

    if(__object.clipEnabled) {
        UI.UIContext.rect(__object.left, __object.top, __object.width, __object.height);
        UI.UIContext.clip();
    }

    //if(__object.__isDirty || __forceDraw) {
        __object.viewBeingDrawn();
    //}

    __object.children.sort(UIIndexSorter);

    for(var i in __object.children) {
        drawObjects(__object.children[i], __forceDraw ? true : __object.__isDirty);
    }

    __object.afterViewDrawn();

    __object.__isDirty = false;

    if(__object.clipEnabled) {
        UI.UIContext.restore();
    }
}
var fps = 0, now, lastUpdate = (new Date())*1 - 1;

// The higher this value, the less the FPS will be affected by quick changes
// Setting this to 1 will show you the FPS of the last sampled frame only
var fpsFilter = 1;

function redrawUI() {
   if(heavyObjects.length > 0) {

    var thisFrameFPS = 1000 / ((now=new Date()) - lastUpdate);
    fps += (thisFrameFPS - fps) / fpsFilter;
    lastUpdate = now;

       heavyObjects.sort(UIIndexSorter);
       UI.UIContext.clearRect(0,0, UI.platformWidth, UI.platformHeight);

        for(var i in heavyObjects) {
            drawObjects(heavyObjects[i]);
        }

   } else {
    console.log('we have no heavy');
   }
   console.log('The last FPS was: ' + fps);
}

// function for calculating 3 letters hex value
function calculatePartialColor(hex, opacity) {
  var r = parseInt(hex.substring(0, 1) + hex.substring(0, 1), 16);
  var g = parseInt(hex.substring(1, 2) + hex.substring(1, 2), 16);
  var b = parseInt(hex.substring(2, 3) + hex.substring(2, 3), 16);

  // set results
  return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + opacity + ')';
}

// function for calculating 6 letters hex value
function calculateFullColor(hex, opacity) {
  var r = parseInt(hex.substring(0, 2), 16);
  var g = parseInt(hex.substring(2, 4), 16);
  var b = parseInt(hex.substring(4, 6), 16);

  // set results
  return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + opacity + ')';

}

function calculate_color_values (sent_hex, opacity) {
    var hex,
    colors = {"aliceblue": "#f0f8ff", "antiquewhite": "#faebd7", "aqua": "#00ffff", "aquamarine": "#7fffd4", "azure": "#f0ffff", "beige": "#f5f5dc", "bisque": "#ffe4c4", "black": "#000000", "blanchedalmond": "#ffebcd", "blue": "#0000ff", "blueviolet": "#8a2be2", "brown": "#a52a2a", "burlywood": "#deb887", "cadetblue": "#5f9ea0", "chartreuse": "#7fff00", "chocolate": "#d2691e", "coral": "#ff7f50", "cornflowerblue": "#6495ed", "cornsilk": "#fff8dc", "crimson": "#dc143c", "cyan": "#00ffff", "darkblue": "#00008b", "darkcyan": "#008b8b", "darkgoldenrod": "#b8860b", "darkgray": "#a9a9a9", "darkgreen": "#006400", "darkkhaki": "#bdb76b", "darkmagenta": "#8b008b", "darkolivegreen": "#556b2f", "darkorange": "#ff8c00", "darkorchid": "#9932cc", "darkred": "#8b0000", "darksalmon": "#e9967a", "darkseagreen": "#8fbc8f", "darkslateblue": "#483d8b", "darkslategray": "#2f4f4f", "darkturquoise": "#00ced1", "darkviolet": "#9400d3", "deeppink": "#ff1493", "deepskyblue": "#00bfff", "dimgray": "#696969", "dodgerblue": "#1e90ff", "firebrick": "#b22222", "floralwhite": "#fffaf0", "forestgreen": "#228b22", "fuchsia": "#ff00ff", "gainsboro": "#dcdcdc", "ghostwhite": "#f8f8ff", "gold": "#ffd700", "goldenrod": "#daa520", "gray": "#808080", "green": "#008000", "greenyellow": "#adff2f", "honeydew": "#f0fff0", "hotpink": "#ff69b4", "indianred ": "#cd5c5c", "indigo ": "#4b0082", "ivory": "#fffff0", "khaki": "#f0e68c", "lavender": "#e6e6fa", "lavenderblush": "#fff0f5", "lawngreen": "#7cfc00", "lemonchiffon": "#fffacd", "lightblue": "#add8e6", "lightcoral": "#f08080", "lightcyan": "#e0ffff", "lightgoldenrodyellow": "#fafad2", "lightgrey": "#d3d3d3", "lightgreen": "#90ee90", "lightpink": "#ffb6c1", "lightsalmon": "#ffa07a", "lightseagreen": "#20b2aa", "lightskyblue": "#87cefa", "lightslategray": "#778899", "lightsteelblue": "#b0c4de", "lightyellow": "#ffffe0", "lime": "#00ff00", "limegreen": "#32cd32", "linen": "#faf0e6", "magenta": "#ff00ff", "maroon": "#800000", "mediumaquamarine": "#66cdaa", "mediumblue": "#0000cd", "mediumorchid": "#ba55d3", "mediumpurple": "#9370d8", "mediumseagreen": "#3cb371", "mediumslateblue": "#7b68ee", "mediumspringgreen": "#00fa9a", "mediumturquoise": "#48d1cc", "mediumvioletred": "#c71585", "midnightblue": "#191970", "mintcream": "#f5fffa", "mistyrose": "#ffe4e1", "moccasin": "#ffe4b5", "navajowhite": "#ffdead", "navy": "#000080", "oldlace": "#fdf5e6", "olive": "#808000", "olivedrab": "#6b8e23", "orange": "#ffa500", "orangered": "#ff4500", "orchid": "#da70d6", "palegoldenrod": "#eee8aa", "palegreen": "#98fb98", "paleturquoise": "#afeeee", "palevioletred": "#d87093", "papayawhip": "#ffefd5", "peachpuff": "#ffdab9", "peru": "#cd853f", "pink": "#ffc0cb", "plum": "#dda0dd", "powderblue": "#b0e0e6", "purple": "#800080", "red": "#ff0000", "rosybrown": "#bc8f8f", "royalblue": "#4169e1", "saddlebrown": "#8b4513", "salmon": "#fa8072", "sandybrown": "#f4a460", "seagreen": "#2e8b57", "seashell": "#fff5ee", "sienna": "#a0522d", "silver": "#c0c0c0", "skyblue": "#87ceeb", "slateblue": "#6a5acd", "slategray": "#708090", "snow": "#fffafa", "springgreen": "#00ff7f", "steelblue": "#4682b4", "tan": "#d2b48c", "teal": "#008080", "thistle": "#d8bfd8", "tomato": "#ff6347", "turquoise": "#40e0d0", "violet": "#ee82ee", "wheat": "#f5deb3", "white": "#ffffff", "whitesmoke": "#f5f5f5", "yellow": "#ffff00", "yellowgreen": "#9acd32"};


    // get sent_hex value to lower case and remove spaces
    sent_hex = sent_hex.toLowerCase().replace(' ','');

    // if sent_hex is a proper color name (check: http://www.w3.org/TR/css3-color/#html4
    // and http://www.w3.org/TR/css3-color/#svg-color for more info)
    if (colors.hasOwnProperty(sent_hex)) {
      // strip # from HEX
      hex = colors[sent_hex].substr(1);
      return calculateFullColor(hex, opacity);

    } else {

      // strip # from HEX
      hex = ( sent_hex.charAt(0) === "#" ? sent_hex.substr(1) : sent_hex );
      // check if 6 letters are provided
      if (hex.length === 6) {
        return calculateFullColor(hex, opacity);
      }
      else if (hex.length === 3) {
        return calculatePartialColor(hex, opacity);
      }
    }
}


// Base view creation
UI.View = Fiber.extend(function() {
   return {
       // The `init` method serves as the constructor.
       init: function(_args) {

           // ===================================================================
           // Define privlaged Vars
           // ===================================================================
           this.__proxyType = 'View';
           this.__parent = undefined;
           this.__width = undefined;
           this.__height = undefined;
           this.__left = 0;
           this.__top = 0;
           this.__frame = {
                x:0,
                y:0,
                w:0,
                h:0
           };
           this.__zindex = 0;
           this.__backgroundColor = '#000';
           this.__gradient = undefined;
           this.__clipEnabled = false;
           this.__isDirty = false;
           this.__guid = GUID();
           this.__opacity = 1;

           this.__children = [];
           this.__orderAdded = 0;
           this.__totalChildrenEver = 0;


           this.__eventListeners = {
               'touchstart': [],
               'touchend': [],
               'touchmove': []
           };
           this.__touchStatus = 0; //0 = not touched, 1 = touch started

           // ===================================================================
           // Define public vars API for Views
           // ===================================================================
           Object.defineProperty(this, "gradient", {
               get: function() { return this.__gradient; },
               set: function(val) {
                    this.__gradient = val;
                    this.__isDirty = true;
                    redrawUI();
               }
           });

           Object.defineProperty(this, "parent", {
               get: function() { return this.__parent; }
           });

           Object.defineProperty(this, "proxyType", {
               get: function() { return this.__proxyType; }
           });

           Object.defineProperty(this, "guid", {
               get: function() { return this.__guid; }
           });

           Object.defineProperty(this, "children", {
             get: function() { return this.__children; },
             set: function(val) {
                 this.__children = val;
                 this.__isDirty = true;
                 redrawUI();
             }
           });

           Object.defineProperty(this, "clipEnabled", {
               get: function() { return this.__clipEnabled; },
               set: function(val) {
                   this.__clipEnabled = val;
                   this.__isDirty = true;
                   redrawUI();
               }
           });

           Object.defineProperty(this, "width", {
               get: function() {
                if(this.__width !== undefined) {
                  return this.__width;
                } else if(this.__parent !== undefined) {
                  return this.__parent.__width - this.__parent.left;
                } else {
                  return UI.platformWidth;
                }
              },
               set: function(val) {
                   this.__width = val;
                   this.__isDirty = true;
                   redrawUI();
               }
           });

           Object.defineProperty(this, "height", {
             get: function() {
              if(this.__height !== undefined) {
                  return this.__height;
                } else if(this.__parent !== undefined) {
                  return this.__parent.height - this.__parent.top;
                } else {
                  return UI.platformHeight;
                }
             },
             set: function(val) {
                 this.__height = val;
                 this.__isDirty = true;
                 redrawUI();
             }
           });

           Object.defineProperty(this, "left", {
               get: function() { return this.__left; },
               set: function(val) {
                   this.__left = val;
                   this.__isDirty = true;
                   redrawUI();
               }
           });

           Object.defineProperty(this, "top", {
               get: function() { return this.__top; },
               set: function(val) {
                   this.__top = val;
                   this.__isDirty = true;
                   redrawUI();
               }
           });

           Object.defineProperty(this, "zindex", {
               get: function() { return this.__zindex; },
               set: function(val) {
                   this.__zindex = val;
                   this.__isDirty = true;
                   redrawUI();
               }
           });

           Object.defineProperty(this, "backgroundColor", {
               get: function() { return this.__backgroundColor; },
               set: function(val) {
                   this.__backgroundColor = val;
                   this.__isDirty = true;
                   redrawUI();
               }
           });

          Object.defineProperty(this, "opacity", {
             get: function() { return this.__opacity; },
             set: function(val) {
                this.__opacity = val;

              }
           });


          for (var key in _args) {
            // if it is a default property, then we use the private name so we dont draw more then we need to
            if(this[key] !== undefined) {
                this['__' + key] = _args[key];
            } else {
              this[key] = _args[key];
            }
          }

       },

       // ===================================================================
       // Define UI Methods
       // ===================================================================
       add: function(viewObject) {
           this.__totalChildrenEver ++;
           viewObject__orderAdded = this.__totalChildrenEver;
           viewObject.__parent = this;

           this.children.push(viewObject); // add the view to the parent ref manager

           this.__isDirty = true;
           redrawUI();

       },

       remove: function(viewObject) {
         viewObject.__parent = undefined;
           for (var i = 0; i < this.children.length; i++) {
               if (this.children[i].guid === viewObject.guid) {
                   this.children.splice(i, 1);
                   break;
               }
           }

           this.__isDirty = true;
           redrawUI();
       },

       // ===================================================================
       // Define lifecycle API
       // ===================================================================
       viewBeingDrawn: function() {
         this.draw();
       },
       afterViewDrawn: function() {

       },
       draw: function() {

           var parent = {
             left: 0,
             top: 0
           };

            if(this.__parent) {
              this.__frame = {
                    x: this.__parent.__frame.x + this.left,
                    y: this.__parent.__frame.y + this.top,
                    h: this.height,
                    w: this.width
              };

              // UI.UIContext.clearRect( this.left + parent.left, this.top + parent.top, this.width, this.height );
              //this.__parent.viewBeingDrawn();
            }


            if(this.__gradient !== undefined) {

              var gradient = UI.UIContext.createLinearGradient(
                this.__frame.x + this.__gradient.startPoint.x,
                this.__frame.y + this.__gradient.startPoint.y,
                this.__frame.x + this.__gradient.endPoint.x,
                this.__frame.y +  this.__gradient.endPoint.y); //vertical   gradient

              for(var i = 0; i<this.__gradient.colors.length; i++) {
                portion = (100 / this.__gradient.colors.length) * (i === 0 ? 0 : i + 1);
                if(portion < 100) {
                  portionFloat = parseFloat('0.'+portion);
                } else {
                  portionFloat = 1;
                }
                gradient.addColorStop(portionFloat, calculate_color_values(this.__gradient.colors[i], 1));
              }

              UI.UIContext.fillStyle = gradient;

            } else {
                UI.UIContext.fillStyle = calculate_color_values(this.backgroundColor, this.opacity);
            }



            UI.UIContext.fillRect( this.__frame.x, this.__frame.y, this.__frame.w, this.__frame.h );
            UI.UIContext.fill();
            UI.UIContext.closePath();


            if(this.clipEnabled) {
                //UI.UIContext.globalCompositeOperation = 'source-atop';
            } else {
                //UI.UIContext.globalCompositeOperation = 'source-over';
            }

       },

       // ===================================================================
       // Define event methods
       // ===================================================================
       addEventListener: function(type, callback) {
           this.__eventListeners[type].push(callback);
       },
       fireEvent: function(type, _args) {
          pleaseReturn = false;

          for(var i in this.__eventListeners[type]) {

            if(type === 'touchmove' && this.__touchStatus === 1) {
                pleaseReturn = true;
                this.__eventListeners[type][i].apply(this,[_args]);

            }
            if(type === 'touchstart') {
                this.__touchStatus = 1;
                pleaseReturn = true;
                this.__eventListeners[type][i].apply(this,[_args]);

            } else if(type === 'touchend') {
                this.__touchStatus = 0;
                pleaseReturn = true;
                this.__eventListeners[type][i].apply(this,[_args]);

            }

          }
          return pleaseReturn;
       }
   };
});



UI.Window = UI.View.extend(function(parentPrototype) {
   return {
       init: function(_args) {
           parentPrototype.init.call(this, _args);

           this.__proxyType = 'Window';
           this.__clipEnabled = true;
           this.__status = 'closed';
           this.__headerBarEnabled = undefined;
           this.__headerBar = undefined;

           Object.defineProperty(this, "headerBar", {
             get: function() { return this.__headerBar; }
           });

           Object.defineProperty(this, "status", {
             get: function() { return this.__status; }
           });

           Object.defineProperty(this, "headerBarEnabled", {
             get: function() { return this.__status; }
           });

            if(this.headerBarEnabled) {
               this.__headerBar = new UI.HeaderBar();
               this.__headerBar.__parent = this;
            }

           this.width = UI.platformWidth;
           this.height = UI.platformHeight;
       },
       close: function() {
            for (var i = 0; i < heavyObjects.length; i++) {
                 if (heavyObjects[i].guid === this.guid) {

                     heavyObjects.splice(i, 1);
                     break;
                 }
             }
             this.__isDirty = false;
             this.__status = 'closed';
             redrawUI();
       },
       open: function() {
            heavyObjects.push(this);
            this.__isDirty = true;
            this.__status = 'open';
            redrawUI();
       },
       afterViewDrawn: function() {
          this.headerBar.draw();
       }
   };
});

UI.HeaderBar = UI.View.extend(function(parentPrototype) {
   return {
       init: function(_args) {
           parentPrototype.init.call(this, _args);

           this.__proxyType = 'HeaderBar';

           this.__width = UI.platformWidth;
           this.__height = 48;
           this.__top = 0;
           this.__gradient = {
                type:'linear',
                colors:['#f1f1f2','#d5d6d6'],
                startPoint:{x:0,y:0},
                endPoint:{x:0,y:40}
            };

       },
       draw: function() {

          UI.UIContext.save(); // Save the state of the context

          UI.UIContext.shadowOffsetY = 2; // Sets the shadow offset y, positive number is down
          UI.UIContext.shadowBlur = 3; // Sets the shadow blur size
          UI.UIContext.shadowColor = calculate_color_values('#999', 1); // Sets the shadow color

          parentPrototype.draw.call(this);

          UI.UIContext.restore(); // Save the state of the context


       }
   };
});

UI.TabGroup = UI.Window.extend(function(parentPrototype) {
   return {
       init: function(_args) {
           parentPrototype.init.call(this, _args);

           this.__proxyType = 'TabGroup';
           this.__tabs = [];
           this.__activeTab = undefined;

            this.__tabbar = new UI.View({
                width:UI.platformWidth,
                height:48,
                top: UI.platformHeight - 48,
                gradient: {
                    type:'linear',
                    colors:['#f1f1f2','#d5d6d6'],
                    startPoint:{x:0,y:0},
                    endPoint:{x:0,y:40}
               }
            });

            Object.defineProperty(this, "activeTab", {
             get: function() { return this.__activeTab; },
             set: function() {
                this.fireEvent('tabChanged', {
                    tab: this.__activeTab
                });
             }
           });

            this.add(this.__tabbar);
       },
        addTab: function(viewObject) {
            if(viewObject.__proxyType == 'Tab') {

                if(typeof viewObject === 'Object' && viewObject.__proxyType === undefined) {

                    viewObject = new UI.Tab(viewObject);
                }

                this.__tabs.push(viewObject);

                for(var i = 0; i < this.__tabs.length; i++) {
                    this.__tabs[i].width =  UI.platformWidth / this.__tabs.length;
                    this.__tabs[i].left =  i * this.__tabs[i].width;

                }

                this.__tabbar.add(viewObject);

            } else {
                console.log('The "addTab" method for the TabGroup expexts a Tab or an Object... ');
            }

       },
       removeTab: function(index) {
           this.__content.remove(viewObject);
       },
       open: function() {
            parentPrototype.open.call(this);
            this.__tabs[0].becomeActive();
       }
   };
});

UI.Tab = UI.View.extend(function(parentPrototype) {
   return {
       init: function(_args) {

           parentPrototype.init.call(this, _args);

           this.__proxyType = 'Tab';
           this.__status = 'closed';
           this.__window = undefined;

           Object.defineProperty(this, "window", {
             get: function() { return this.__window; },
             set: function(val) {
                 // ensure the value is valid
                if(val === undefined || val.__proxyType !== 'Window') {
                    throw "The value of a window property on a Tab must be a Window";
                }

                 this.__window = val;

                 this.__isDirty = true;
                 redrawUI();

             }
           });

           Object.defineProperty(this, "status", {
                get: function() { return this.__status; }
           });

            this.addEventListener('touchstart', this.becomeActive);

           this.backgroundColor = '#777';
           this.height = 48;
           this.width = 60;
           this.__gradient = {
                type:'linear',
                colors:['#f1f1f2','#d5d6d6'],
                startPoint:{x:0,y:0},
                endPoint:{x:0,y:40}
           };
           _args.window.height = _args.window.height - this.height;
           this.window = _args.window;

       },
       becomeActive: function() {
        if(this.__status !== 'open') {
               this.__status = 'open';

               this.__gradient = {
                    type:'linear',
                    colors:['#ebebec','#c6c9c9'],
                    startPoint:{x:0,y:0},
                    endPoint:{x:0,y:40}
               };

               if(this.parent.activeTab !== undefined) {
                    this.parent.activeTab.becomeInactive();
               }

               this.parent.activeTab = this;
                this.window.open();

          }
       },
       becomeInactive: function(__callback) {
           this.__status = 'closed';
           this.__gradient = {
                type:'linear',
                colors:['#f1f1f2','#d5d6d6'],
                startPoint:{x:0,y:0},
                endPoint:{x:0,y:40}
           };
           this.window.close();
       }
   };
});

UI.ScrollView = UI.View.extend(function(parentPrototype) {
   return {
       init: function(_args) {
           parentPrototype.init.call(this, _args);

           this.__proxyType = 'ScrollView';
           this.__clipEnabled = true;
           this.__backgroundColor = 'grey';

           this.__currentX = 0;
           this.__currentY = 0;

           this.__scrollX = false;
           this.__scrollY = true;

           Object.defineProperty(this, "scrollX", {
               get: function() { return this.__scrollX; },
               set: function(val) {
                   if(typeof val === 'bool') {
                       this.__scrollX = val;
                       this.resetScroll();
                       this.__isDirty = true;
                       redrawUI();
                   } else {
                       console.log('ScrollX only accepts a bool value, '+typeof val+' was given.');
                   }
               }
           });

           Object.defineProperty(this, "ScrollY", {
               get: function() { return this.__scrollY; },
               set: function(val) {
                   if(typeof val === 'bool') {
                       this.__scrollY = val;
                       this.resetScroll();
                       this.__isDirty = true;
                       redrawUI();
                   } else {
                       console.log('ScrollY only accepts a bool value, '+typeof val+' was given.');
                   }
               }
           });
           this.__content = new UI.View({width:this.width, height:this.height, backgroundColor: _args.backgroundColor});

           this.addToBase(this.__content);

           this.__content.left = this.__currentX;
           this.__content.top = this.__currentY;
           this.__acX = 0;
           this.__acY = 0;
           this.__decay = 0.55;
           this.__timer = undefined;
           this.__resetTimer = undefined;

           this.__fingerPlacementX = 0;
           this.__fingerPlacementY = 0;

           this.__maximumScrollWidth = this.width - this.__visibleWidth;
           this.__maximumScrollHeight = this.height - this.__visibleHeight;


           /********************************************
            * The following items are related to the
            * Scrolling physics of a scrollview
            *******************************************/
           this.initialTouchPlacement = function(e){
               clearTimeout(this.__resetTimer);
               this.__fingerPlacementX = e.touches[0].x;
               this.__fingerPlacementY = e.touches[0].y;
           },
           this.touchMovement = function(e){
               var updatedFingerPlacementX = e.touches[0].x;
               var updatedFingerPlacementY = e.touches[0].y;

               var deltaXmovement = (updatedFingerPlacementX - this.__fingerPlacementX) * 0.3;
               var deltaYmovement = (updatedFingerPlacementY - this.__fingerPlacementY) * 0.3;



               this.__fingerPlacementX = updatedFingerPlacementX;
               this.__fingerPlacementY = updatedFingerPlacementY;
               this.__acX += deltaXmovement;
               this.__acY += deltaYmovement;
               this.easeScrolling();

       };
           this.easeScrolling = function(){
               if (this.__timer === undefined) {
                   this.__timer = setInterval(this.createTouchCallbacks(this, this.scrolling), 33);
               }
           };
           this.scrolling = function(){

               this.__currentX += this.__acX;
               this.__currentY += this.__acY;


               var zerosnapBackTop = (this.__currentY - this.__currentY * this.__decay);
               var totalHeightSnapBack = (this.__currentY - (this.__maximumScrollHeight + this.__currentY) * this.__decay);


               var zerosnapBackLeft = (this.__currentX - this.__curren__tX * this.__decay);
               var totalWidthSnapBack = (this.__currentX - (this.__maximumScrollWidth + this.__currentX) * this.__decay);

               if (this.__scrollX) {
                   this.__currentX = (this.__currentX > 0) ? zerosnapBackLeft : (this.__currentX < -this.__maximumScrollWidth) ? totalWidthSnapBack : this.__currentX;
                   this.__acX *= 0.55;
                   if(this.__content.left != parseInt(this.__currentX, 0)) {
                       this.__content.left = parseInt(this.__currentX, 0);
                       console.log('scrolling left: '+this.__content.left);
                   }
               }

               if (this.__scrollY) {
                   this.__currentY = (this.__currentY > 0) ? zerosnapBackTop : (this.__currentY < -this.maximumScrollHeight) ? totalHeightSnapBack : this.__currentY;
                   this.__acY *= 0.55;
                   if(this.__content.top != parseInt(this.__currentY, 0)) {
                       this.__content.top = parseInt(this.__currentY, 0);
                   }

               }
           };
           this.createTouchCallbacks = function(obj, func){
               var f = function(){
                   var target = arguments.callee.target;
                   var func = arguments.callee.func;
                   return func.apply(target, arguments);
               };

               f.target = obj;
               f.func = func;
               return f;
           };
           this.resetScroll = function(){
                if( this.__currentY >= -1) {
                    var that = this;
                   this.__resetTimer = setTimeout(function() {
                       clearInterval(that.__timer);
                       that.__timer = undefined;
                       that.__acY = that.__fingerPlacementX = that.__currentX = 0;
                       that.__acX = that.__fingerPlacementY = that.__currentY = 0;
                       that.__content.left = that.__currentX;
                       that.__content.top = that.__currentY;

                       that = undefined;

                   }, 600);
               }
           };

           this.addEventListener('touchstart', this.createTouchCallbacks(this, this.initialTouchPlacement), false);
           this.addEventListener('touchmove', this.createTouchCallbacks(this, this.touchMovement), false);
           this.addEventListener('touchend', this.createTouchCallbacks(this, this.resetScroll), false);

       },
       addToBase: function(_args) {
           parentPrototype.add.call(this, _args);
       },
       add: function(viewObject) {
           this.__content.add(viewObject);

       },
       remove: function(viewObject) {
           this.__content.remove(viewObject);
       }
   };
});

UI.ImageView = UI.View.extend(function(parentPrototype) {
   return {
       init: function(_args) {

           this.__proxyType = 'Window';
           this.__clipEnabled = true;
           this.__src = "";

           Object.defineProperty(this, "src", {
             get: function() { return this.__src; },
             set: function(val) {
                this.__src = val;

              }
           });

           parentPrototype.init.call(this, _args);


       },
       draw: function() {
          if(this.opacity !== 1) {
              UI.UIContext.globalAlpha = this.opacity;
          }

           var parent = {
             left: 0,
             top: 0
           };

            if(this.__parent) {
              this.__frame = {
                    x: this.__parent.__frame.x + this.left,
                    y: this.__parent.__frame.y + this.top,
                    h: this.height,
                    w: this.width
              };

              // UI.UIContext.clearRect( this.left + parent.left, this.top + parent.top, this.width, this.height );
              //this.__parent.viewBeingDrawn();
            }

            var img = new Image();
            var that = this;
            // //img.onload = function() {
            //     that = undefined;
            // //};
            img.src = this.src;

            UI.UIContext.drawImage( img, that.__frame.x, that.__frame.y, that.__frame.w, that.__frame.h );
            that = undefined;

            if(this.opacity !== 1) {
                UI.UIContext.globalAlpha = 1;
            }

            if(this.clipEnabled) {
                UI.UIContext.globalCompositeOperation = 'source-atop';
            } else {
                UI.UIContext.globalCompositeOperation = 'source-over';
            }

       }
   };
});


// // Widget creation

// UI.Image = function(args) {
//     args = args || {};
//     this.__proxyType = 'Image';

//     this.width = args.width;
//     this.height = args.height;
//     this.backgroundColor = args.backgroundColor;

// };
// extend(UI.Image, UI.View);


/***********************************************************
* Test what we just made...
**********************************************************/
var tabgroup = new UI.TabGroup({});

var win1 = new UI.Window({
   backgroundColor: '#e9e9e9'
});

var box = new UI.View({
   width:40,
   height:40,
   top:124,
   left: 50,
   backgroundColor: '#000'
});

var win2 = new UI.Window({
   backgroundColor: '#e9e9e9'
});

var box3 = new UI.ImageView({
   width:100,
   height:100,
   top:124,
   left: 50,
   name: 'dog',
   src: '3d-android-icon.jpg'
});
win2.add(box3);

var box4 = new UI.ImageView({
   width:100,
   height:100,
   top:124,
   left: 160,
   src: 'Windows Phone.png'
});
win2.add(box4);

var box5 = new UI.ImageView({
   width:100,
   height:100,
   top:124,
   left: 260,
   src: 'Xcode-icon.png'
});
win2.add(box5);

var tab1 = new UI.Tab({window: win1});
var tab2 = new UI.Tab({window: win2});

tabgroup.addTab(tab1);
tabgroup.addTab(tab2);


box.addEventListener('touchstart', function() {
   console.log('box was touched!!!!');
});

var box2 = new UI.ScrollView({
   zindex:100,
   top: 48,
   backgroundColor: 'yellow'
});
box2.addEventListener('touchstart', function() {
   console.log('box 2 was touched!!!!');
});
win1.add(box2);

box2.add(box);


tabgroup.open();
