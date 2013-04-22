/*
TODOs:
X error handling if action throws
X stack tagging
X run
X next/later?
X waterfall
X handle nested runloops
X autorun
X debounce
- string methods
- coalesce laters/nexts
- try/finally bullshit
- ability to wrap flush - queue.aroundFlush = Ember.changeProperties
- sync?
- hasScheduledTimers
- cancel
- perfs?
- only tag stack in dev mode
*/

var slice = [].slice,
    pop = [].pop,
    DeferredActionQueues;

var Backburner = Ember.Backburner = function(queueNames) {
  this.queueNames = queueNames;
};

function createAutorun(backburner) {
  backburner.begin();
  setTimeout(function() {
    backburner.end();
  });
}

Backburner.prototype = {
  queueNames: null,
  currentInstance: null,
  previousInstance: null,

  begin: function() {
    if (this.currentInstance) {
      this.previousInstance = this.currentInstance;
    }
    this.currentInstance = new DeferredActionQueues(this.queueNames);
  },

  end: function() {
    try {
      this.currentInstance.flush();
    } finally {
      this.currentInstance = null;
      if (this.previousInstance) {
        this.currentInstance = this.previousInstance;
        this.previousInstance = null;
      }      
    }
  },

  run: function(target, method /*, args */) {
    var ret;
    this.begin();

    if (!method) {
      method = target;
      target = null;
    }

    if (typeof method === 'string') {
      method = target[method];
    }

    var args = arguments.length > 2 ? slice.call(arguments, 2) : undefined;
    try {
      ret = method.apply(target, args);
    } catch(e) {
      throw e;
    } finally {
      this.end();
    }
    return ret;
  },

  schedule: function(queueName, target, method /* , args */) {
    // TODO: assert args?
    var stack = new Error().stack,
        args = arguments.length > 3 ? slice.call(arguments, 3) : undefined;
    if (!this.currentInstance) { createAutorun(this); }
    this.currentInstance.schedule(queueName, target, method, args, false, stack);
  },

  scheduleOnce: function(queueName, target, method /* , args */) {
    // TODO: assert args?
    var stack = new Error().stack,
        args = arguments.length > 3 ? slice.call(arguments, 3) : undefined;
    if (!this.currentInstance) { createAutorun(this); }
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
  },

  debounce: function(target, method /* , args, wait */) {
    var self = this,
        args = arguments,
        wait = pop.call(args),
        debouncee;

    for (var i = 0, l = debouncees.length; i < l; i++) {
      debouncee = debouncees[i];
      if (debouncee[0] === target && debouncee[1] === method) { return; } // do nothing
    }

    var timer = setTimeout(function() {
      self.run.apply(self, args);

      // remove debouncee
      var index = -1;
      for (var i = 0, l = debouncees.length; i < l; i++) {
        debouncee = debouncees[i];
        if (debouncee[0] === target && debouncee[1] === method) {
          index = i;
          break;
        }
      }

      if (index > -1) { debouncees.splice(index, 1); }
    }, wait);

    debouncees.push([target, method, timer]);
  },

  cancelTimers: function() {
    for (var i = 0, l = debouncees.length; i < l; i++) {
      clearTimeout(debouncees[i][2]);
    }

    debouncees = [];
  }
};

var debouncees = [];

DeferredActionQueues = function(queueNames) {
  var queues = this.queues = {};
  this.queueNames = queueNames = queueNames || [];

  var queueName;
  for (var i = 0, l = queueNames.length; i < l; i++) {
    queueName = queueNames[i];
    queues[queueName] = new Queue(queueName);
  }
};

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
    while(!this.next()) {}
  },

  next: function() {
    // Run first encountered item from first non empty queue.
    var queues = this.queues,
        queueNames = this.queueNames,
        queueName, queue;

    for (var i = 0, l = queueNames.length; i < l; i++) {
      queueName = queueNames[i];
      queue = queues[queueName];

      var action = queue.shift();
      if (!action) { continue; }

      var target = action[0],
          method = action[1],
          args   = action[2];

      if (typeof method === 'string') {
        method = target[method];
      }

      method.apply(target, args);

      return false;
    }
    return true;
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

  shift: function() {
    return this._queue.shift();
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

    for (var i = 0; i < queue.length; i++) {
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
