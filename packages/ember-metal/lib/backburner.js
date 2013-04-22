/*
TODOs:
X error handling if action throws
X stack tagging
X run
X next/later?
- waterfall
- ability to wrap flush - queue.aroundFlush = Ember.changeProperties
- autorun
- onerror hook
- handle nested runloops

*/

var slice = [].slice,
    pop = [].pop;

var Backburner = Ember.Backburner = function(queueNames) {
  this.queueNames = queueNames;
};

Backburner.prototype = {
  queueNames: null,
  currentInstance: null,

  begin: function() {
    this.currentInstance = new DeferredActionQueues(this.queueNames);
  },

  end: function() {
    this.currentInstance.flush();
  },

  run: function(target, method /*, args */) {
    this.begin();
    
    if (!method) {
      method = target;
      target = null;
    }
    
    var args = arguments.length > 2 ? slice.call(arguments, 2) : undefined;
    method.apply(target, args);
    this.end();
  },

  schedule: function(queueName, target, method /* , args */) {
    // TODO: assert args?
    var stack = new Error().stack,
        args = arguments.length > 3 ? slice.call(arguments, 3) : undefined;
    this.currentInstance.schedule(queueName, target, method, args, false, stack);
  },

  scheduleOnce: function(queueName, target, method /* , args */) {
    // TODO: assert args?
    var stack = new Error().stack,
        args = arguments.length > 3 ? slice.call(arguments, 3) : undefined;
    this.currentInstance.schedule(queueName, target, method, args, true, stack);
  },

  next: function() {
    var self = this,
        args = arguments;
    setTimeout(function() {
      self.run.apply(self, args);
    });
  },

  later: function() {
    var self = this,
        args = arguments,
        wait = pop.call(args);

    setTimeout(function() {
      self.run.apply(self, args);
    }, wait);
  }
};

function DeferredActionQueues(queueNames) {
  var queues = this.queues = {};
  this.queueNames = queueNames = queueNames || [];

  var queueName;
  for (var i = 0, l = queueNames.length; i < l; i++) {
    queueName = queueNames[i];
    queues[queueName] = new Queue(queueName);
  }
}

DeferredActionQueues.prototype = {
  queueNames: null,
  queues: null,

  schedule: function(queueName, target, method, args, onceFlag, stack) {
    var queues = this.queues,
        queue = queues[queueName];
    
    if (!queue) { throw new Error("You attempted to schedule an action in a queue (" + queueName + ") that doesn't exist"); }

    if (onceFlag) {
      queue.pushUnique(target, method, args, stack);
    } else {
      queue.push(target, method, args, stack);
    }
  },

  flush: function() {
    var queues = this.queues,
        queueNames = this.queueNames,
        queueName, queue;

    for (var i = 0, l = queueNames.length; i < l; i++) {
      queueName = queueNames[i];
      queue = queues[queueName];
      queue.flush();
    }
  }
};

function Queue(name) {
  this.name = name;
  this._queue = [];
}

Queue.prototype = {
  name: null,
  _queue: null,

  push: function(target, method, args, stack) {
    this._queue.push([target, method, args, stack]);
  },

  pushUnique: function(target, method, args, stack) {
    var queue = this._queue, action;

    for (var i = 0, l = queue.length; i < l; i++) {
      action = queue[i];

      if (action[0] === target && action[1] === method) {
        action[2] = args; // replace args
        action[3] = stack; // replace stack
        return;
      }
    }

    this._queue.push([target, method, args, stack]);
  },

  flush: function() {
    var queue = this._queue,
        action, target, method, args;

    for (var i = 0, l = queue.length; i < l; i++) {
      action = queue[i];
      target = action[0];
      method = action[1];
      args   = action[2];

      try {
        method.apply(target, args);
      } catch(e) {

      }
    }

    this._queue = [];
  }
};