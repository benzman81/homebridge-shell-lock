var shell = require('shelljs');

var Service, Characteristic;

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;

  homebridge.registerPlatform("homebridge-shell-lock", "ShellLockPlatform", ShellLockPlatform);
  homebridge.registerAccessory("homebridge-shell-lock", "ShellLock", ShellLockAccessory);
};

function ShellLockPlatform(log, config) {
  this.log = log;
  this.locks = config["locks"] || [];
  this.cacheDirectory = config["cache_directory"];

  this.storage = require('node-persist');
  this.storage.initSync({
    dir : this.cacheDirectory
  });
}

ShellLockPlatform.prototype = {

  accessories : function(callback) {
    var accessories = [];
    for (var i = 0; i < this.locks.length; i++) {
      var lock = new ShellLockAccessory(this.log, this.locks[i], this);
      accessories.push(lock);
    }
    callback(accessories);
  }
}

function ShellLockAccessory(log, config, shellLockPlatform) {
  this.log = log;
  this.shellLockPlatform = shellLockPlatform;
  this.id = config["id"];
  this.name = config["name"];
  this.lockCommand = config["lockCommand"];
  this.unlockCommand = config["unlockCommand"];
  this.autoLock = config["autoLock"];

  this.informationService = new Service.AccessoryInformation();
  this.informationService.setCharacteristic(Characteristic.Manufacturer, "ShellLockPlatform").setCharacteristic(Characteristic.Model, "ShellLock").setCharacteristic(Characteristic.SerialNumber, "ShellLock-Id " + this.id);

  this.lockService = new Service.LockMechanism(this.name, this.name);
  this.lockService.getCharacteristic(Characteristic.LockCurrentState).on('get', this.getState.bind(this));
  this.lockService.getCharacteristic(Characteristic.LockTargetState).on('get', this.getState.bind(this)).on('set', this.setState.bind(this));

  var isLockedCached = this._getIsLockedCached();
  var lastLockedCached = isLockedCached ? Characteristic.LockCurrentState.SECURED : Characteristic.LockCurrentState.UNSECURED;
  var lastLockedTargetCached = isLockedCached ? Characteristic.LockTargetState.SECURED : Characteristic.LockTargetState.UNSECURED;
  this.lockService.getCharacteristic(Characteristic.LockTargetState).updateValue(lastLockedTargetCached, undefined, null);
  this.lockService.getCharacteristic(Characteristic.LockCurrentState).updateValue(lastLockedCached, undefined, null);
};

ShellLockAccessory.prototype._getIsLockedCached = function() {
  var lockCache = this.shellLockPlatform.storage.getItemSync(this._getLockStorageKey());
  if (lockCache === undefined) {
    return true;
  }
  return lockCache.isLocked;
};

ShellLockAccessory.prototype._setLockCache = function _setLockCache(isLocked) {
  var newCache = {
    isLocked : this._getIsLockedCached(),
  }
  if (isLocked !== undefined && isLocked !== null) {
    newCache.isLocked = isLocked;
  }
  this.shellLockPlatform.storage.setItemSync(this._getLockStorageKey(), newCache);
};

ShellLockAccessory.prototype._getLockStorageKey = function _getLockStorageKey() {
  return 'shell-lock-' + this.id + '-cache';
};

ShellLockAccessory.prototype.getState = function(callback) {
  var isLockedCached = this._getIsLockedCached();
  callback(null, isLockedCached ? Characteristic.LockCurrentState.SECURED : Characteristic.LockCurrentState.UNSECURED);
};

ShellLockAccessory.prototype.execLockAction = function(doLock, callback) {
  var command = this.unlockCommand;
  if (doLock) {
    command = this.lockCommand;
  }
  this.log("execLockAction is executed for doLock '%s' with command '%s'", doLock, command);
  shell.exec(command, {
    silent : true
  }, callback);
}

ShellLockAccessory.prototype.setState = function(homeKitState, callback) {
  var doLock = homeKitState == Characteristic.LockTargetState.SECURED;
  var newHomeKitState = doLock ? Characteristic.LockCurrentState.SECURED : Characteristic.LockCurrentState.UNSECURED;
  var newHomeKitStateTarget = doLock ? Characteristic.LockTargetState.SECURED : Characteristic.LockTargetState.UNSECURED;

  var lockActionCallback = function(code, stdout, stderr) {
    if (code !== 0) {
      newHomeKitState = !doLock ? Characteristic.LockCurrentState.SECURED : Characteristic.LockCurrentState.UNSECURED;
      newHomeKitStateTarget = !doLock ? Characteristic.LockTargetState.SECURED : Characteristic.LockTargetState.UNSECURED;
      this.lockService.getCharacteristic(Characteristic.LockTargetState).updateValue(newHomeKitStateTarget, undefined, null);
      this.lockService.getCharacteristic(Characteristic.LockCurrentState).updateValue(newHomeKitState, undefined, null);

      var errorString = "code = '" + code + "', stdout = '" + stdout + "', stderr = '" + stderr + "'";
      this.log("Lock state could not be changed isLocked = '%s' as an error occured ('%s')", doLock, errorString);
      this._setLockCache(!doLock);
      if (callback) {
        callback(new Error(errorString));
      }
    }
    else {
      this.lockService.getCharacteristic(Characteristic.LockTargetState).updateValue(newHomeKitStateTarget, undefined, null);
      this.lockService.getCharacteristic(Characteristic.LockCurrentState).updateValue(newHomeKitState, undefined, null);
      this.log("Lock state is isLocked = '%s'", doLock);
      this._setLockCache(doLock);

      if (!doLock && this.autoLock && this.autoLock > 0) {
        setTimeout((function() {
          this.setState(Characteristic.LockTargetState.SECURED);
        }).bind(this), this.autoLock);
      }
      if (callback) {
        callback(null);
      }
    }
  }.bind(this);

  this.execLockAction(doLock, lockActionCallback);
};

ShellLockAccessory.prototype.getServices = function() {
  return [ this.lockService, this.informationService ];
};