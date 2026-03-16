var GKTSystemJSversion = 'v0.4';
var system_receivername = 'de.gekartel.VALUECHANGED';

var SYSTEM = {
  getVersion: function () {
    return GKTSystemJSversion;
  },
  /**
   *	@param action, Intent action
   *	@return void
   **/
  sendIntent: function (action, obj) {
    try {
      GKTKiosk.sendIntent(action, JSON.stringify(obj));
    } catch (e) {}
  },
  /**
   *	@param facility, subsystem identifier
   *	@param msg, message to be logged
   *	@return void
   **/
  log: function (msg) {
    SYSTEM.log2('APP', msg);
  },
  log2: function (facility, msg) {
    try {
      GKTKiosk.log(facility, 1, msg);
    } catch (e) {
      console.log('[' + facility + ']: ' + msg);
    }
  },
  /**
   *	@param facility, subsystem identifier
   *	@param msg, message to be logged as an error
   *	@return void
   **/
  error: function (msg) {
    try {
      SYSTEM.error2('APP', msg);
    } catch (e) {}
  },
  error2: function (facility, msg) {
    try {
      GKTKiosk.log(facility, 2, msg);
    } catch (e) {}
  },
  /**
   *	@param facility, subsystem identifier
   *	@param msg, message to be logged as an warning
   *	@return void
   **/
  warning: function (msg) {
    try {
      SYSTEM.warning2('APP', msg);
    } catch (e) {}
  },
  warning2: function (facility, msg) {
    try {
      GKTKiosk.log(facility, 3, msg);
    } catch (e) {}
  },
  /**
   *	@param filename to be printed, absolute path are the better choice
   *	@param callback, function which is being called afer the printerjob does execute
   *	@return void
   **/
  print: function (filename, callback) {
    SYSTEM.log2('PRINTER', "printing '" + filename + "'");
    SYSTEM.execute2('lpr ' + filename, callback, true, 30000, 'PRINTER');
  },
  /**
   *   @param callback, function which is being called afer the printerjob does execute
   *   @return void
   **/
  printerstatus: function (callback) {
    SYSTEM.execute('tspprinterstatus /dev/usb/lp0', callback, true, 30000, 'PRINTER');
  },
  onReceiveIntent: function (obj) {
    console.log('receice intent :' + obj.action);
    console.log(obj);
    if (obj.extras != 'undefined') {
      obj = obj.extras;
      console.log('receice source :' + obj.EventSource);
      switch (obj.eventSource) {
        case 'printer':
          //log state of the printer
          if (obj.canprint != 'true') {
            SYSTEM.error2(
              'PRINTER',
              'connected:' + obj.connected + ';paper:' + obj.paper + ';cover:' + obj.cover
            );
            if (obj.printed == 'false') {
              SYSTEM.error2('PRINTER', 'print job failed');
            }
          } else {
            if (obj.paper != 'ok') SYSTEM.error2('PRINTER', obj.paper);
          }
          if (typeof obj.printed != 'undefined') {
            if (obj.printed == 'true') {
              SYSTEM.log2('PRINTER', 'job printed');
            }
          }
          if (typeof SYSTEM.onPrinterStatusChange != 'undefined') SYSTEM.onPrinterStatusChange(obj);
          break;
        case 'NFC':
          if (typeof SYSTEM.onNfcScanned != 'undefined') SYSTEM.onNfcScanned(obj);
          break;
        default:
      }
    }
    //custom intent handel
  },
  onPrinterStatusChange: null,
  registerOnPrinterStatusChange: function (callback) {
    SYSTEM.onPrinterStatusChange = callback;
  },
  /**
   *	@param filename to be printed, absolute path are the better choice
   *	@param callback, function which is being called afer the printerjob does execute
   *	@return void
   **/
  printerserviceprint: function (filename, callback) {
    SYSTEM.log2('PRINTER', "printing '" + filename + "'");
    SYSTEM.sendIntent('de.gekartel.printerpos', {
      filename: filename,
      jobtype: 'print',
      sendto: system_receivername,
    });
  },
  /**
   *	@param callback, function which is being called afer the printerjob does execute
   *	@return void
   **/
  printerservicestatus: function () {
    SYSTEM.log2('PRINTER', 'getstatus ');
    SYSTEM.sendIntent('de.gekartel.printerpos', { jobtype: 'status', sendto: system_receivername });
  },

  /**
   *	intern function
   *   currently use for error logging printer functionallity
   **/
  checkcallback: function (code, stdout, stderr, facility) {
    if (code != 0) {
      //in errorcase we log by our self
      SYSTEM.error2(facility, 'Call termiante with an error code:' + stdout + ' message' + stderr);
    } else {
      //cb(code,stdout);
    }
  },
  /**
   *	Wrapper around Sitekiosk execute function
   *   @param a, defines the command to be executed
   *   @param b, defines the callback function
   *   @param c, run as root
   *   @param d, timeout in milliseconds
   *   @check_callback,name a facility in which in error case a log will be generated as an error
   *   @return void
   *
   **/
  execute: function (a, b, c, d, check_callback) {
    SYSTEM.execute2(a, b, c, d);
  },
  /**
   *	Sitekiosk execute function
   *   @param a, defines the command to be executed
   *   @param b, defines the callback function
   *   @param c, run as root
   *   @param d, timeout in milliseconds
   *   @return void
   **/
  execute2: function (a, b, c, d) {
    SYSTEM.log2('SYSTEM', 'execute ' + a);
    // android cannot handle js functions as parameter, that's why we pass the name of the callback
    var index = SYSTEM.createCallback(b, null);
    GKTKiosk.execute(a, 'SYSTEM.callback', c, d, index);
  },
  callbacklist: new Array(),
  /**
   *	create a callback so we can intercept calling of execute and their callback
   *   @cb, callback defined by the application
   *   @check_callback, if this is set, if the function fails, it will be log as an error
   *   @return new callback
   **/
  createCallback: function (cb, check_callback) {
    var currentindex = SYSTEM.callbacklist.length;
    SYSTEM.callbacklist.push(cb);
    return currentindex;
  },
  /**
   *	create a callback so we can intercept calling of execute and their callback
   *   @code, return value of the process
   *   @stdout , what was written to standard out
   *   @stderr , what was written to standard err
   *   @index, to identify the application callback
   *   @return void
   **/
  callback: function (code, stdout, stderr, index) {
    var cb = SYSTEM.callbacklist[index];
    SYSTEM.callbacklist[index] = null;
    cb(code, stdout, stderr);
  },
  /**
   *	to log unknown barcode
   *   @bc, barcode which is not currently known to the application
   *   @return void
   **/
  unknownBarcode: function (bc) {
    SYSTEM.log2('SCANNER', 'unknown barcode ' + bc);
  },
  /**
   *	to log unknown nfc
   *   @bc, nfc which is not currently known to the application
   *   @return void
   **/
  unknownNfc: function (bc) {
    SYSTEM.log2('NFC', 'unknown nfc ' + bc);
  },
  /**
   *	todo
   *	send a email
   *	@param to, wh
   *   @param subject
   *   @param body
   *   @param callback(result,messsage)
   *   @return void
   **/
  sendEmail: function (to, subject, body, callback) {
    SYSTEM.log2('EMAIL', 'not currently implemented');
    callback(1, 'Email not currently  implemented');
  },
  /**
	* 	todo
	* 	send a sms
	* 	@param to
	* 	@param message
	* 	@param enablemultipart, if a message does not fit in one SMS,
			   set this to true to send more SMS, if disabled Message
			   will not be sent
	* 	@param callback(result,messsage)
	* 	@return void
	**/
  sendSMS: function (to, subject, enablemultipart, callback) {
    SYSTEM.log2('SMS', 'not currently implemented');
    callback(1, 'SMS currently not implemented');
  },
  /**
   * 	check online status
   * 	@return true/false
   **/
  isOnline: function () {
    //live could be easy this seems to be buggy
    return navigator.onLine;
  },
  /**
   * 	set volume
   *	@param vol, volume to be set
   * 	@void
   **/
  setVolume: function (vol) {
    SYSTEM.log2('SOUND', 'set volume to' + vol);
    if (typeof siteKiosk.system.audio != 'undefined') {
      siteKiosk.system.audio.setVolume(vol, 3);
    }
  },
  /**
   * 	get current volume
   * 	@return volume
   **/
  getVolume: function (vol) {
    return siteKiosk.system.audio.getVolume(3);
  },
  /**
	* 	take a snapshot from webcam
	*	@param callback
				callback(status,message)
				if status is "0", message contains the filename
				if status is not "0", message contains error code
	* 	@return void
	**/
  takePicture: function (callback) {
    callback(-1, 'currently not implemented');
  },

  //intern functions no comments
  mouselog: function (event) {
    SYSTEM.log2('MOUSE', event.type + ' ' + event.pageX + ' ' + event.pageY + ' ' + location.href);
    if (event.type == 'mousedown') {
      SYSTEM.checkforEscape(event.pageX, event.pageY);
    }
  },
  //arrayValue:new Array({x:0,y:0,x2:200,y2:200},{x:1024-200,y:0,x2:1024,y2:200},{x:0,y:0,x2:200,y2:200},{x:1024-200,y:0,x2:1024,y2:200}),
  arrayValue: new Array(
    { x: 0, y: 0, x2: 200, y2: 200 },
    { x: window.innerWidth - 200, y: 0, x2: window.innerWidth, y2: 200 },
    { x: 0, y: 0, x2: 200, y2: 200 },
    { x: window.innerWidth - 200, y: 0, x2: window.innerWidth, y2: 200 }
  ),
  index: 0,
  oldx: 0,
  oldy: 0,
  checkforEscape: function (x, y) {
    //no double clicks
    if (x == SYSTEM.oldx && y == SYSTEM.oldy) {
      return;
    }
    //check coordinates
    if (x > SYSTEM.arrayValue[SYSTEM.index].x && x < SYSTEM.arrayValue[SYSTEM.index].x2) {
      if (y > SYSTEM.arrayValue[SYSTEM.index].y && y < SYSTEM.arrayValue[SYSTEM.index].y2) {
        SYSTEM.index++;
        if (SYSTEM.index > 3) {
          SYSTEM.index = 0;
          SYSTEM.log2('SYSTEM', 'escape sequence detected ');
          try {
            SYSTEM.escape_cb();
          } catch (e) {
            SYSTEM.log2('SYSTEM', 'escape sequence callback defect');
          }
        }
      } else {
        SYSTEM.index = 0;
      }
    } else {
      SYSTEM.index = 0;
    }
  },
  online: function (event) {
    SYSTEM.log2('SYSTEM', 'is online');
  },
  offline: function (event) {
    SYSTEM.log2('SYSTEM', 'is offline');
  },
  escape_cb: null,
  registerEscape: function (cb) {
    SYSTEM.escape_cb = cb;
  },
  onSensorEvent: function (jsondata) {
    //old style interface
    var handled = false;
    console.log(jsondata);
    switch (jsondata.eventSource) {
      case 'barcode':
        if (SYSTEM.registerBarcode(jsondata.barcode)) handled = true;
        break;
      case 'motion':
        if (SYSTEM.registerMotionEvent(jsondata.motion)) handled = true;
        break;
      case 'ismmodul':
        if (
          SYSTEM.registerInputChanged(
            jsondata,
            jsondata.value,
            jsondata.inputport,
            jsondata.inputportvalue
          )
        )
          handled = true;
        break;
      case 'nfc':
        console.log(jsondata);
        if (typeof SYSTEM.onNfcScanned === 'function') {
          SYSTEM.onNfcScanned(jsondata);
          handled = true;
        }
        break;
    }
    if (!handled) {
      if (typeof onSensorEvent != 'undefined') {
        onSensorEvent(jsondata);
      } else {
        SYSTEM.log2('onSensorEvent ', 'no callback for eventSource: ' + jsondata.eventSource);
      }
    }
  },
  registerBarcode: function (barcode) {
    console.log(barcode);
    if (barcode) {
      SYSTEM.log2('SCANNER', barcode);
      if (typeof onBarcodeScanned != 'undefined') {
        try {
          if (onBarcodeScanned(barcode) == false) {
            //log unknown barcode
            SYSTEM.unknownBarcode(barcode);
          } else {
            return true;
          }
        } catch (e) {}
      } else {
        SYSTEM.log2('SCANNER', 'no callback');
      }
    }
    return false;
  },
  onNfcScanned: null,
  registerNfc: function (callback) {
    SYSTEM.onNfcScanned = callback;
  },
  registerMotionEvent: function (motionvalue) {
    if (motionvalue) {
      SYSTEM.log2('MOTION', motionvalue);
      if (typeof onMotionEvent != 'undefined') {
        try {
          if (onMotionEvent(motionvalue) == false) {
            //log unknown barcode
            SYSTEM.log2('MOTION', 'onMotionEvent returned false, ' + motionvalue);
          } else {
            return true;
          }
        } catch (e) {}
      } else {
        SYSTEM.log2('MOTION', 'no callback');
      }
      return;
    }
    return false;
  },
  registerInputChanged: function (jsondata) {
    if (jsondata.inputboardid) {
      SYSTEM.log2(
        'IOConnector',
        jsondata.inputboardid + ' ' + jsondata.inputport + ' ' + jsondata.inputportvalue
      );
      try {
        if (typeof jsondata.inputportstates != 'undefined') {
          return SYSTEM.registerInputStates(jsondata);
        } else {
          if (
            onInputChanged(jsondata.inputboardid, jsondata.inputport, jsondata.inputportvalue) ==
            false
          ) {
            //log unknown
            SYSTEM.log2(
              'IOConnector',
              'unknownInputChanged ' + inputboardid + ' ' + inputport + ' ' + inputportvalue
            );
          } else {
            return true;
          }
        }
      } catch (e) {}
      SYSTEM.log2('IOConnector', 'no callback(1)');
    }
    return false;
  },
  registerInputStates: function (inputboardid, inputarray) {
    if (jsondata.inputportstates) {
      SYSTEM.log2('IOConnector', jsondata.inputboardid + ' ' + inputobj);
      if (typeof jsondata.inputportstates != 'undefined') {
        try {
          onInputStates(inputboardid, jsondata.inputportstates);
          return true;
        } catch (e) {}
      } else {
        SYSTEM.log2('IOConnector', 'no callback(2)');
      }
    }
    return false;
  },
  registerInputBoards: function (jsondata, inputboardidarray) {
    var inputboards = JSON.parse(inputboardidarray);
    if (jsondata.inputboardids) {
      try {
        onInputBoardIds(inputboards);
        return true;
      } catch (e) {}
      SYSTEM.log2('IOConnector', 'no callback(3)');
    }
    return false;
  },
  requestInputStates: function (inputboardid) {
    if (inputboardid) {
      if (typeof inputboardid != 'undefined') {
        SYSTEM.log2('IOConnector', 'request input states from board ' + inputboardid);
        SYSTEM.sendIntent('de.gekartel.ISMLight.send', {
          command: 'getboardstates',
          boardid: inputboardid,
        });
      } else {
        SYSTEM.log2('IOConnector', 'no callback(4)');
      }
      return;
    }
  },
  requestInputBoardIds: function () {
    SYSTEM.log2('IOConnector', 'request available input board ids');
    SYSTEM.sendIntent('de.gekartel.ISMLight.send', { command: 'getboardids' });
    return;
  },
};
SYSTEM.registerEscape(function () {
  SYSTEM.log('Try to redirect to workmenu');
  GKTKiosk.startWorkmenu();
});

SYSTEM.log('system.js loaded', false);
/*
add some event processing
*/
window.addEventListener('mousedown', SYSTEM.mouselog, false);
window.addEventListener('online', SYSTEM.online, false);
window.addEventListener('offline', SYSTEM.offline, false);
