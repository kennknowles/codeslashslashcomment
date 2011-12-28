// Piggybacking Functional Reactive Programming Concepts on top of Backbone

/*
  Functional Reactive Programming, or FRP, is an elegant approach to
  "purely functional" event-driven programming with values that change
  over time. It is a change of perspective from the usual meaning of
  "event driven" in Javascript that is a lot more compositional.

  There is already a from-first-principles implementation of FRP in
  Javascript via the Flapjax compiler, a lot of related ideas are in
  knockout.js, and Asana says their Luna framework was inspired by
  FRP. But I want to demonstrate how simple it is to get a naive
  implementation of FRP off the ground by using the event-handling
  already offered by Backbone.  Since we are in Javascript, the
  semantic work that has gone into FRP is pretty much out the window
  anyhow.

  Let's dive in; here's the HTML shell I'm going to use:

  ...

  You can get jquery, backbone, and underscore however you like.
  I just tossed them in the directory for this demo.
*/  

$(document).ready(function() {
    console.log("ready!");

    /*
      FRP is based on two main semantic types that are very closely
      related: event streams and behaviors. I am renaming them to
      match what I think is more normal terminology for this
      context. Event streams are infinite sequences of data attached
      to a time, where time is nondecreasing. Behaviors are variables
      whose value changes continuously over time, i.e. functions of
      time. In pseudo-Haskell:

      EventStream a = [(Time, Event)]
      
      Behavior a = Time -> a
      
      The key issue is that "Time" is not a type we actually have
      available, so we keep these types abstract and expose primitives
      and combinators. There are many implementation choices
      available, the latest and greatest is described in <a
      href="http://conal.net/papers/push-pull-frp/push-pull-frp.pdf">Push-Pull
      Functional Reactive Programming</a> by Conal Elliott, but since
      we are in a mutatey language already that has some event
      handling, the best reference is probably <a
      href="http://conal.net/papers/new-fran-draft.pdf">this draft</a>
      of an imperative implementation strategy.
  
      One major takeaway from FRP is make the *event stream* first
      class, so let us start with defining that class. It is quite
      literally just a handle for listening for occurences of
      events. In actual  use, you have to deal with the
      fact that listeners should be weak references, but that is a
      battle for another day.
    */

    var EventStream = function() { };
    _.extend(EventStream.prototype, Backbone.Events, {
	_listen: function(callback) {
	    this.bind("occur", callback);
	},
	
	_unlisten: function(callback) {
	    this.unbind("occur", callback);
	},

	_occur: function(payload) {
	    this.trigger("occur", payload);
	}
    });
   
    /*
      The _listen and _occur methods expose the implementation of
      EventStream. If you are calling them, then you are not really
      doing FRP, and your code would not necessarily be portable to a
      different implementation strategy.
    
      The most obvious event stream (to me?) is a heartbeat that says
      the time. From this we can build useful things like
      pseudo-continuous time. This does violate an FRP notion of _time
      invariance_ where a program always behaves the same when shifted
      in time, but oh well!
    */

    var timerE = function(delay) {
	var stream = new EventStream();
	setInterval(function() {
	    stream._occur(new Date());
	});
	return stream;
    }

    /*
      An implementation for Behaviors is simply a boxed variable and
      otherwise looks very similar. Again, no client code should ever
      call _change or _observe.
    */

    var Behavior = function(initialValue) { 
	this.value = initialValue;
    }
    _.extend(Behavior.prototype, Backbone.Events, {
	_change: function(newValue) {
	    this.value = newValue;
	    this.trigger("change", newValue);
	},

	_observe: function(fn) {
	    this.bind("change", fn);
	},

	_unobserve: function(fn) {
	    this.unbind("change", fn);
	}
    });
   

    /*
      A first primitive form of behavior is the stepper: Starting with
      some initial value, it listens to an event stream and saves
      the values that come in.
    */
    
    var stepperB = function(initialValue, stream) {
	var behavior = new Behavior(initialValue);
	stream._listen(function(eventValue) {
	    behavior._change(eventValue);
	})
	return behavior;
    }

    /* And now we can make a behavior that counts time upwards */

    var timeB = function(init, granularity) { return stepperB(init, timerE(granularity)); };

    /* 
       That is a taste of how we build behaviors and event streams without going under
       the hood, but we will need more primitives. In particular we will
       definitely need to be able to map event streams and behaviors.
    */

    var mapE = function(f, stream) {
	var mappedE = new EventStream();
	stream._listen(function(ev) {
	    mappedE._occur(f(ev));
	});
	return mappedE;
    }

    var mapB = function(f, behavior) {
	var mappedB = new Behavior(behavior.value);
	behavior._observe(function(v) {
	    mappedB._change(f(v));
	});
	return mappedB;
    }

    /*
      Hmmm, those look very similar. Indeed, we forgot to implement the inverse of stepper,
      and then we would only need one of mapB and mapE. I'll add a few more
      primitives here.
    */

    var changesE = function(behavior) {
	var stream = new EventStream();
	behavior._observe(function(value) {
	    stream._occur(value);
	});
	return stream;
    }
    
    var mapB_2 = function(f, behavior) {
	return stepperB(behavior.value, mapE(f, changesE(behavior)));
    }

    var filterE = function(p, stream) {
	var filtered = new EventStream();
	stream._listen(function(event) {
	    if (p(event)) filtered._occur(event);
	});
	return filtered;
    }

    var snapshotE = function(behavior, stream) {
	var snapshots = new EventStream();
	stream._listen(function(event) {
	    snapshots._occur(behavior.value); // bad? probably
	});
	return snapshots;
    }

    /*
      And this all gets to be the most fun when it is higher-order.
      The switcherB starts as one behavior, but listens for new
      ones on an event and switches over to them. This is
      also a primitive
    */

    var switcherB = function(initialB, behaviorsE) {
	var b = new Behavior(initialB.value);
	var currentB = initialB;
	var callback = function(value) {
	    b._change(value);
	}
	currentB._observe(callback);
	behaviorsE._listen(function (newB) {
	    currentB._unobserve(callback);
	    currentB = newB;
	    currentB._observe(callback);
	    b._change(currentB.value);
	});
	return b;
    }

    /*
      To actually see this stuff, we need a "legacy" adapters to the
      browsers imperatively-updated DOM. In this implementation, we
      can actually above mapB for this, but that is not in the spirit
      of the function, so we'll drop to primitives again.
     */

    var bindB = function(elem, behavior) {
	behavior._observe(function(value) {
	    $(elem).html(value);
	});
    }

    /*
      If you are a clever imperative programmer you will have noticed that
      I could also have implemented _observe and _changes with mapB. There
      are a lot of pieces of this framework that suffice to build
      the rest out.

      Another thing to note is that the framework does nothing to
      minimize the amount of event passing that happens.  You've got
      filterE (and potentially friennds) to do that, but it can take
      some ingenuity to make sure the same value isn't pushed over and
      over. I'm sure there are solutions in the literature which I
      have simply neglected in this quick hack.

      Anyhow, we can now bind a bunch of behaviors to the DOM and
      watch them go.
     */
    
    var startMillis = new Date().getTime();

    var datetimeToDecisB = timeB(0, 100);
    bindB($('#datetime'), mapB(function(d) { return d.toString(); }, datetimeToDecisB));

    var decisB = mapB(function(dt) { return Math.floor(dt.getTime() / 100); }, datetimeToDecisB);
    bindB($('#deciseconds'), decisB);

    var decisWrapE = filterE(function(value) { return value % 10 == 0; }, changesE(decisB));
    var decisWhenWrappedB = stepperB(decisB.value, snapshotE(decisB, decisWrapE));

    var secondsB = mapB(function(decis) { return Math.floor(decis / 10); }, decisB);
    var secondsB2 = mapB_2(function(decis) { return Math.floor(decis / 10); }, decisB);
    bindB($('#seconds'), secondsB);
    bindB($('#seconds2'), secondsB2);

    var secondsB3 = mapB(function(decis) { return Math.floor(decis / 10); }, decisWhenWrappedB);
    var isEven = function(n) { return n % 2 == 0; }
    var secondsEvenB = mapB(isEven, secondsB3)

    var stutterB = switcherB(decisB,
			     mapE(function(even) { return even ? decisB : decisWhenWrappedB; },
				  changesE(secondsEvenB)));
    
    bindB($('#secondsEven'), mapB(function(even) { return even ? "YES \\(^_^)/" : "NO ;_;"; }, secondsEvenB));
    bindB($('#stutter'), stutterB);

    var template = ich['icanhaz-example'];
    bindB($('#icanhaz-output'), mapB(template,
				     mapB(function(decis) { return {list: _.range(decis % 10)}; },
					  decisB)));

    /*
      That was fun! Google around to see what is out there.  There are
      a number of additional primitives needed, and most libraries
      provide a huge pile of them. The closest thing I can reacall
      seeing about figuring out canonical primitives is <a
      href="http://www.wpi.edu/Pubs/ETD/Available/etd-042908-133033/unrestricted/cking.pdf">this
      rather challenging paper</a>.
    
      For real libraries, I think <a
      href="http://hackage.haskell.org/package/reactive">Reactive</a>
      in Haskell is the state of the art. I'm not sure about libraries
      in other languages, but would love to hear about them.
    */
});
