// \0rolldown/runtime.js
var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod, mod.exports), cb = null), mod.exports);
let node_fs = require("node:fs");
let node_module = require("node:module");
let node_worker_threads = require("node:worker_threads");
// ../../../../../node_modules/.bun/vscode-jsonrpc@10.0.0/node_modules/vscode-jsonrpc/lib/common/is.js
var require_is = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.boolean = boolean;
	exports.string = string;
	exports.number = number;
	exports.error = error;
	exports.func = func;
	exports.array = array;
	exports.stringArray = stringArray;
	function boolean(value) {
		return value === true || value === false;
	}
	function string(value) {
		return typeof value === "string" || value instanceof String;
	}
	function number(value) {
		return typeof value === "number" || value instanceof Number;
	}
	function error(value) {
		return value instanceof Error;
	}
	function func(value) {
		return typeof value === "function";
	}
	function array(value) {
		return Array.isArray(value);
	}
	function stringArray(value) {
		return array(value) && value.every((elem) => string(elem));
	}
}));
// ../../../../../node_modules/.bun/vscode-jsonrpc@10.0.0/node_modules/vscode-jsonrpc/lib/common/messages.js
var require_messages = /* @__PURE__ */ __commonJSMin(((exports, module, this$9) => {
	var __createBinding = this$9 && this$9.__createBinding || (Object.create ? (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		var desc = Object.getOwnPropertyDescriptor(m, k);
		if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) desc = {
			enumerable: true,
			get: function() {
				return m[k];
			}
		};
		Object.defineProperty(o, k2, desc);
	}) : (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		o[k2] = m[k];
	}));
	var __setModuleDefault = this$9 && this$9.__setModuleDefault || (Object.create ? (function(o, v) {
		Object.defineProperty(o, "default", {
			enumerable: true,
			value: v
		});
	}) : function(o, v) {
		o["default"] = v;
	});
	var __importStar = this$9 && this$9.__importStar || (function() {
		var ownKeys = function(o) {
			ownKeys = Object.getOwnPropertyNames || function(o) {
				var ar = [];
				for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
				return ar;
			};
			return ownKeys(o);
		};
		return function(mod) {
			if (mod && mod.__esModule) return mod;
			var result = {};
			if (mod != null) {
				for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
			}
			__setModuleDefault(result, mod);
			return result;
		};
	})();
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.Message = exports.NotificationType9 = exports.NotificationType8 = exports.NotificationType7 = exports.NotificationType6 = exports.NotificationType5 = exports.NotificationType4 = exports.NotificationType3 = exports.NotificationType2 = exports.NotificationType1 = exports.NotificationType0 = exports.NotificationType = exports.RequestType9 = exports.RequestType8 = exports.RequestType7 = exports.RequestType6 = exports.RequestType5 = exports.RequestType4 = exports.RequestType3 = exports.RequestType2 = exports.RequestType1 = exports.RequestType = exports.RequestType0 = exports.AbstractMessageSignature = exports.ParameterStructures = exports.ResponseError = exports.ErrorCodes = void 0;
	const is = __importStar(require_is());
	/**
	* Predefined error codes.
	*/
	var ErrorCodes;
	(function(ErrorCodes) {
		ErrorCodes.ParseError = -32700;
		ErrorCodes.InvalidRequest = -32600;
		ErrorCodes.MethodNotFound = -32601;
		ErrorCodes.InvalidParams = -32602;
		ErrorCodes.InternalError = -32603;
		/**
		* This is the start range of JSON RPC reserved error codes.
		* It doesn't denote a real error code. No application error codes should
		* be defined between the start and end range. For backwards
		* compatibility the `ServerNotInitialized` and the `UnknownErrorCode`
		* are left in the range.
		*
		* @since 3.16.0
		*/
		ErrorCodes.jsonrpcReservedErrorRangeStart = -32099;
		/** @deprecated use  jsonrpcReservedErrorRangeStart */
		ErrorCodes.serverErrorStart = -32099;
		/**
		* An error occurred when write a message to the transport layer.
		*/
		ErrorCodes.MessageWriteError = -32099;
		/**
		* An error occurred when reading a message from the transport layer.
		*/
		ErrorCodes.MessageReadError = -32098;
		/**
		* The connection got disposed or lost and all pending responses got
		* rejected.
		*/
		ErrorCodes.PendingResponseRejected = -32097;
		/**
		* The connection is inactive and a use of it failed.
		*/
		ErrorCodes.ConnectionInactive = -32096;
		/**
		* Error code indicating that a server received a notification or
		* request before the server has received the `initialize` request.
		*/
		ErrorCodes.ServerNotInitialized = -32002;
		ErrorCodes.UnknownErrorCode = -32001;
		/**
		* This is the end range of JSON RPC reserved error codes.
		* It doesn't denote a real error code.
		*
		* @since 3.16.0
		*/
		ErrorCodes.jsonrpcReservedErrorRangeEnd = -32e3;
		/** @deprecated use  jsonrpcReservedErrorRangeEnd */
		ErrorCodes.serverErrorEnd = -32e3;
	})(ErrorCodes || (exports.ErrorCodes = ErrorCodes = {}));
	exports.ResponseError = class ResponseError extends Error {
		code;
		data;
		constructor(code, message, data) {
			super(message);
			this.code = is.number(code) ? code : ErrorCodes.UnknownErrorCode;
			this.data = data;
			Object.setPrototypeOf(this, ResponseError.prototype);
		}
		toJson() {
			const result = {
				code: this.code,
				message: this.message
			};
			if (this.data !== void 0) result.data = this.data;
			return result;
		}
	};
	var ParameterStructures = class ParameterStructures {
		kind;
		/**
		* The parameter structure is automatically inferred on the number of parameters
		* and the parameter type in case of a single param.
		*/
		static auto = new ParameterStructures("auto");
		/**
		* Forces `byPosition` parameter structure. This is useful if you have a single
		* parameter which has a literal type.
		*/
		static byPosition = new ParameterStructures("byPosition");
		/**
		* Forces `byName` parameter structure. This is only useful when having a single
		* parameter. The library will report errors if used with a different number of
		* parameters.
		*/
		static byName = new ParameterStructures("byName");
		constructor(kind) {
			this.kind = kind;
		}
		static is(value) {
			return value === ParameterStructures.auto || value === ParameterStructures.byName || value === ParameterStructures.byPosition;
		}
		toString() {
			return this.kind;
		}
	};
	exports.ParameterStructures = ParameterStructures;
	/**
	* An abstract implementation of a MessageType.
	*/
	var AbstractMessageSignature = class {
		method;
		numberOfParams;
		constructor(method, numberOfParams) {
			this.method = method;
			this.numberOfParams = numberOfParams;
		}
		get parameterStructures() {
			return ParameterStructures.auto;
		}
	};
	exports.AbstractMessageSignature = AbstractMessageSignature;
	/**
	* Classes to type request response pairs
	*/
	var RequestType0 = class extends AbstractMessageSignature {
		/**
		* Clients must not use this property. It is here to ensure correct typing.
		*/
		_;
		constructor(method) {
			super(method, 0);
		}
	};
	exports.RequestType0 = RequestType0;
	var RequestType = class extends AbstractMessageSignature {
		_parameterStructures;
		/**
		* Clients must not use this property. It is here to ensure correct typing.
		*/
		_;
		constructor(method, _parameterStructures = ParameterStructures.auto) {
			super(method, 1);
			this._parameterStructures = _parameterStructures;
		}
		get parameterStructures() {
			return this._parameterStructures;
		}
	};
	exports.RequestType = RequestType;
	var RequestType1 = class extends AbstractMessageSignature {
		_parameterStructures;
		/**
		* Clients must not use this property. It is here to ensure correct typing.
		*/
		_;
		constructor(method, _parameterStructures = ParameterStructures.auto) {
			super(method, 1);
			this._parameterStructures = _parameterStructures;
		}
		get parameterStructures() {
			return this._parameterStructures;
		}
	};
	exports.RequestType1 = RequestType1;
	var RequestType2 = class extends AbstractMessageSignature {
		/**
		* Clients must not use this property. It is here to ensure correct typing.
		*/
		_;
		constructor(method) {
			super(method, 2);
		}
	};
	exports.RequestType2 = RequestType2;
	var RequestType3 = class extends AbstractMessageSignature {
		/**
		* Clients must not use this property. It is here to ensure correct typing.
		*/
		_;
		constructor(method) {
			super(method, 3);
		}
	};
	exports.RequestType3 = RequestType3;
	var RequestType4 = class extends AbstractMessageSignature {
		/**
		* Clients must not use this property. It is here to ensure correct typing.
		*/
		_;
		constructor(method) {
			super(method, 4);
		}
	};
	exports.RequestType4 = RequestType4;
	var RequestType5 = class extends AbstractMessageSignature {
		/**
		* Clients must not use this property. It is here to ensure correct typing.
		*/
		_;
		constructor(method) {
			super(method, 5);
		}
	};
	exports.RequestType5 = RequestType5;
	var RequestType6 = class extends AbstractMessageSignature {
		/**
		* Clients must not use this property. It is here to ensure correct typing.
		*/
		_;
		constructor(method) {
			super(method, 6);
		}
	};
	exports.RequestType6 = RequestType6;
	var RequestType7 = class extends AbstractMessageSignature {
		/**
		* Clients must not use this property. It is here to ensure correct typing.
		*/
		_;
		constructor(method) {
			super(method, 7);
		}
	};
	exports.RequestType7 = RequestType7;
	var RequestType8 = class extends AbstractMessageSignature {
		/**
		* Clients must not use this property. It is here to ensure correct typing.
		*/
		_;
		constructor(method) {
			super(method, 8);
		}
	};
	exports.RequestType8 = RequestType8;
	var RequestType9 = class extends AbstractMessageSignature {
		/**
		* Clients must not use this property. It is here to ensure correct typing.
		*/
		_;
		constructor(method) {
			super(method, 9);
		}
	};
	exports.RequestType9 = RequestType9;
	var NotificationType = class extends AbstractMessageSignature {
		_parameterStructures;
		/**
		* Clients must not use this property. It is here to ensure correct typing.
		*/
		_;
		constructor(method, _parameterStructures = ParameterStructures.auto) {
			super(method, 1);
			this._parameterStructures = _parameterStructures;
		}
		get parameterStructures() {
			return this._parameterStructures;
		}
	};
	exports.NotificationType = NotificationType;
	var NotificationType0 = class extends AbstractMessageSignature {
		/**
		* Clients must not use this property. It is here to ensure correct typing.
		*/
		_;
		constructor(method) {
			super(method, 0);
		}
	};
	exports.NotificationType0 = NotificationType0;
	var NotificationType1 = class extends AbstractMessageSignature {
		_parameterStructures;
		/**
		* Clients must not use this property. It is here to ensure correct typing.
		*/
		_;
		constructor(method, _parameterStructures = ParameterStructures.auto) {
			super(method, 1);
			this._parameterStructures = _parameterStructures;
		}
		get parameterStructures() {
			return this._parameterStructures;
		}
	};
	exports.NotificationType1 = NotificationType1;
	var NotificationType2 = class extends AbstractMessageSignature {
		/**
		* Clients must not use this property. It is here to ensure correct typing.
		*/
		_;
		constructor(method) {
			super(method, 2);
		}
	};
	exports.NotificationType2 = NotificationType2;
	var NotificationType3 = class extends AbstractMessageSignature {
		/**
		* Clients must not use this property. It is here to ensure correct typing.
		*/
		_;
		constructor(method) {
			super(method, 3);
		}
	};
	exports.NotificationType3 = NotificationType3;
	var NotificationType4 = class extends AbstractMessageSignature {
		/**
		* Clients must not use this property. It is here to ensure correct typing.
		*/
		_;
		constructor(method) {
			super(method, 4);
		}
	};
	exports.NotificationType4 = NotificationType4;
	var NotificationType5 = class extends AbstractMessageSignature {
		/**
		* Clients must not use this property. It is here to ensure correct typing.
		*/
		_;
		constructor(method) {
			super(method, 5);
		}
	};
	exports.NotificationType5 = NotificationType5;
	var NotificationType6 = class extends AbstractMessageSignature {
		/**
		* Clients must not use this property. It is here to ensure correct typing.
		*/
		_;
		constructor(method) {
			super(method, 6);
		}
	};
	exports.NotificationType6 = NotificationType6;
	var NotificationType7 = class extends AbstractMessageSignature {
		/**
		* Clients must not use this property. It is here to ensure correct typing.
		*/
		_;
		constructor(method) {
			super(method, 7);
		}
	};
	exports.NotificationType7 = NotificationType7;
	var NotificationType8 = class extends AbstractMessageSignature {
		/**
		* Clients must not use this property. It is here to ensure correct typing.
		*/
		_;
		constructor(method) {
			super(method, 8);
		}
	};
	exports.NotificationType8 = NotificationType8;
	var NotificationType9 = class extends AbstractMessageSignature {
		/**
		* Clients must not use this property. It is here to ensure correct typing.
		*/
		_;
		constructor(method) {
			super(method, 9);
		}
	};
	exports.NotificationType9 = NotificationType9;
	var Message;
	(function(Message) {
		/**
		* Tests if the given message is a request message
		*/
		function isRequest(message) {
			const candidate = message;
			return candidate && is.string(candidate.method) && (is.string(candidate.id) || is.number(candidate.id));
		}
		Message.isRequest = isRequest;
		/**
		* Tests if the given message is a notification message
		*/
		function isNotification(message) {
			const candidate = message;
			return candidate && is.string(candidate.method) && message.id === void 0;
		}
		Message.isNotification = isNotification;
		/**
		* Tests if the given message is a response message
		*/
		function isResponse(message) {
			const candidate = message;
			return candidate && (candidate.result !== void 0 || !!candidate.error) && (is.string(candidate.id) || is.number(candidate.id) || candidate.id === null);
		}
		Message.isResponse = isResponse;
	})(Message || (exports.Message = Message = {}));
}));
// ../../../../../node_modules/.bun/vscode-jsonrpc@10.0.0/node_modules/vscode-jsonrpc/lib/common/linkedMap.js
var require_linkedMap = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.LRUCache = exports.LinkedMap = exports.Touch = void 0;
	var Touch;
	(function(Touch) {
		Touch.None = 0;
		Touch.First = 1;
		Touch.AsOld = Touch.First;
		Touch.Last = 2;
		Touch.AsNew = Touch.Last;
	})(Touch || (exports.Touch = Touch = {}));
	var LinkedMap = class {
		[Symbol.toStringTag] = "LinkedMap";
		_map;
		_head;
		_tail;
		_size;
		_state;
		constructor() {
			this._map = /* @__PURE__ */ new Map();
			this._head = void 0;
			this._tail = void 0;
			this._size = 0;
			this._state = 0;
		}
		clear() {
			this._map.clear();
			this._head = void 0;
			this._tail = void 0;
			this._size = 0;
			this._state++;
		}
		isEmpty() {
			return !this._head && !this._tail;
		}
		get size() {
			return this._size;
		}
		get first() {
			return this._head?.value;
		}
		get last() {
			return this._tail?.value;
		}
		before(key) {
			const item = this._map.get(key);
			return item ? item.previous?.value : void 0;
		}
		after(key) {
			const item = this._map.get(key);
			return item ? item.next?.value : void 0;
		}
		has(key) {
			return this._map.has(key);
		}
		get(key, touch = Touch.None) {
			const item = this._map.get(key);
			if (!item) return;
			if (touch !== Touch.None) this.touch(item, touch);
			return item.value;
		}
		set(key, value, touch = Touch.None) {
			let item = this._map.get(key);
			if (item) {
				item.value = value;
				if (touch !== Touch.None) this.touch(item, touch);
			} else {
				item = {
					key,
					value,
					next: void 0,
					previous: void 0
				};
				switch (touch) {
					case Touch.None:
						this.addItemLast(item);
						break;
					case Touch.First:
						this.addItemFirst(item);
						break;
					case Touch.Last:
						this.addItemLast(item);
						break;
					default: this.addItemLast(item);
				}
				this._map.set(key, item);
				this._size++;
			}
			return this;
		}
		delete(key) {
			return !!this.remove(key);
		}
		remove(key) {
			const item = this._map.get(key);
			if (!item) return;
			this._map.delete(key);
			this.removeItem(item);
			this._size--;
			return item.value;
		}
		shift() {
			if (!this._head && !this._tail) return;
			if (!this._head || !this._tail) throw new Error("Invalid list");
			const item = this._head;
			this._map.delete(item.key);
			this.removeItem(item);
			this._size--;
			return item.value;
		}
		forEach(callbackfn, thisArg) {
			const state = this._state;
			let current = this._head;
			while (current) {
				if (thisArg) callbackfn.bind(thisArg)(current.value, current.key, this);
				else callbackfn(current.value, current.key, this);
				if (this._state !== state) throw new Error(`LinkedMap got modified during iteration.`);
				current = current.next;
			}
		}
		keys() {
			const state = this._state;
			let current = this._head;
			const iterator = {
				[Symbol.iterator]: () => {
					return iterator;
				},
				next: () => {
					if (this._state !== state) throw new Error(`LinkedMap got modified during iteration.`);
					if (current) {
						const result = {
							value: current.key,
							done: false
						};
						current = current.next;
						return result;
					} else return {
						value: void 0,
						done: true
					};
				}
			};
			return iterator;
		}
		values() {
			const state = this._state;
			let current = this._head;
			const iterator = {
				[Symbol.iterator]: () => {
					return iterator;
				},
				next: () => {
					if (this._state !== state) throw new Error(`LinkedMap got modified during iteration.`);
					if (current) {
						const result = {
							value: current.value,
							done: false
						};
						current = current.next;
						return result;
					} else return {
						value: void 0,
						done: true
					};
				}
			};
			return iterator;
		}
		entries() {
			const state = this._state;
			let current = this._head;
			const iterator = {
				[Symbol.iterator]: () => {
					return iterator;
				},
				next: () => {
					if (this._state !== state) throw new Error(`LinkedMap got modified during iteration.`);
					if (current) {
						const result = {
							value: [current.key, current.value],
							done: false
						};
						current = current.next;
						return result;
					} else return {
						value: void 0,
						done: true
					};
				}
			};
			return iterator;
		}
		[Symbol.iterator]() {
			return this.entries();
		}
		trimOld(newSize) {
			if (newSize >= this.size) return;
			if (newSize === 0) {
				this.clear();
				return;
			}
			let current = this._head;
			let currentSize = this.size;
			while (current && currentSize > newSize) {
				this._map.delete(current.key);
				current = current.next;
				currentSize--;
			}
			this._head = current;
			this._size = currentSize;
			if (current) current.previous = void 0;
			this._state++;
		}
		addItemFirst(item) {
			if (!this._head && !this._tail) this._tail = item;
			else if (!this._head) throw new Error("Invalid list");
			else {
				item.next = this._head;
				this._head.previous = item;
			}
			this._head = item;
			this._state++;
		}
		addItemLast(item) {
			if (!this._head && !this._tail) this._head = item;
			else if (!this._tail) throw new Error("Invalid list");
			else {
				item.previous = this._tail;
				this._tail.next = item;
			}
			this._tail = item;
			this._state++;
		}
		removeItem(item) {
			if (item === this._head && item === this._tail) {
				this._head = void 0;
				this._tail = void 0;
			} else if (item === this._head) {
				if (!item.next) throw new Error("Invalid list");
				item.next.previous = void 0;
				this._head = item.next;
			} else if (item === this._tail) {
				if (!item.previous) throw new Error("Invalid list");
				item.previous.next = void 0;
				this._tail = item.previous;
			} else {
				const next = item.next;
				const previous = item.previous;
				if (!next || !previous) throw new Error("Invalid list");
				next.previous = previous;
				previous.next = next;
			}
			item.next = void 0;
			item.previous = void 0;
			this._state++;
		}
		touch(item, touch) {
			if (!this._head || !this._tail) throw new Error("Invalid list");
			if (touch !== Touch.First && touch !== Touch.Last) return;
			if (touch === Touch.First) {
				if (item === this._head) return;
				const next = item.next;
				const previous = item.previous;
				if (item === this._tail) {
					previous.next = void 0;
					this._tail = previous;
				} else {
					next.previous = previous;
					previous.next = next;
				}
				item.previous = void 0;
				item.next = this._head;
				this._head.previous = item;
				this._head = item;
				this._state++;
			} else if (touch === Touch.Last) {
				if (item === this._tail) return;
				const next = item.next;
				const previous = item.previous;
				if (item === this._head) {
					next.previous = void 0;
					this._head = next;
				} else {
					next.previous = previous;
					previous.next = next;
				}
				item.next = void 0;
				item.previous = this._tail;
				this._tail.next = item;
				this._tail = item;
				this._state++;
			}
		}
		toJSON() {
			const data = [];
			this.forEach((value, key) => {
				data.push([key, value]);
			});
			return data;
		}
		fromJSON(data) {
			this.clear();
			for (const [key, value] of data) this.set(key, value);
		}
	};
	exports.LinkedMap = LinkedMap;
	var LRUCache = class extends LinkedMap {
		_limit;
		_ratio;
		constructor(limit, ratio = 1) {
			super();
			this._limit = limit;
			this._ratio = Math.min(Math.max(0, ratio), 1);
		}
		get limit() {
			return this._limit;
		}
		set limit(limit) {
			this._limit = limit;
			this.checkTrim();
		}
		get ratio() {
			return this._ratio;
		}
		set ratio(ratio) {
			this._ratio = Math.min(Math.max(0, ratio), 1);
			this.checkTrim();
		}
		get(key, touch = Touch.AsNew) {
			return super.get(key, touch);
		}
		peek(key) {
			return super.get(key, Touch.None);
		}
		set(key, value) {
			super.set(key, value, Touch.Last);
			this.checkTrim();
			return this;
		}
		checkTrim() {
			if (this.size > this._limit) this.trimOld(Math.round(this._limit * this._ratio));
		}
	};
	exports.LRUCache = LRUCache;
}));
// ../../../../../node_modules/.bun/vscode-jsonrpc@10.0.0/node_modules/vscode-jsonrpc/lib/common/disposable.js
var require_disposable = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.Disposable = void 0;
	var Disposable;
	(function(Disposable) {
		function create(func) {
			return { dispose: func };
		}
		Disposable.create = create;
	})(Disposable || (exports.Disposable = Disposable = {}));
}));
// ../../../../../node_modules/.bun/vscode-jsonrpc@10.0.0/node_modules/vscode-jsonrpc/lib/common/ral.js
var require_ral = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	let _ral;
	function RAL() {
		if (_ral === void 0) throw new Error(`No runtime abstraction layer installed`);
		return _ral;
	}
	(function(RAL) {
		function install(ral) {
			if (ral === void 0) throw new Error(`No runtime abstraction layer provided`);
			_ral = ral;
		}
		RAL.install = install;
	})(RAL || (RAL = {}));
	exports.default = RAL;
}));
// ../../../../../node_modules/.bun/vscode-jsonrpc@10.0.0/node_modules/vscode-jsonrpc/lib/common/events.js
var require_events = /* @__PURE__ */ __commonJSMin(((exports, module, this$8) => {
	var __importDefault = this$8 && this$8.__importDefault || function(mod) {
		return mod && mod.__esModule ? mod : { "default": mod };
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.Emitter = exports.Event = void 0;
	const ral_1 = __importDefault(require_ral());
	var Event;
	(function(Event) {
		const _disposable = { dispose() {} };
		Event.None = function() {
			return _disposable;
		};
	})(Event || (exports.Event = Event = {}));
	var CallbackList = class {
		_callbacks;
		_contexts;
		add(callback, context = null, bucket) {
			if (!this._callbacks) {
				this._callbacks = [];
				this._contexts = [];
			}
			this._callbacks.push(callback);
			this._contexts.push(context);
			if (Array.isArray(bucket)) bucket.push({ dispose: () => this.remove(callback, context) });
		}
		remove(callback, context = null) {
			if (!this._callbacks) return;
			let foundCallbackWithDifferentContext = false;
			for (let i = 0, len = this._callbacks.length; i < len; i++) if (this._callbacks[i] === callback) {
				if (this._contexts[i] === context) {
					this._callbacks.splice(i, 1);
					this._contexts.splice(i, 1);
					return;
				} else foundCallbackWithDifferentContext = true;
			}
			if (foundCallbackWithDifferentContext) throw new Error("When adding a listener with a context, you should remove it with the same context");
		}
		invoke(...args) {
			if (!this._callbacks) return [];
			const ret = [], callbacks = this._callbacks.slice(0), contexts = this._contexts.slice(0);
			for (let i = 0, len = callbacks.length; i < len; i++) try {
				ret.push(callbacks[i].apply(contexts[i], args));
			} catch (e) {
				(0, ral_1.default)().console.error(e);
			}
			return ret;
		}
		isEmpty() {
			return !this._callbacks || this._callbacks.length === 0;
		}
		dispose() {
			this._callbacks = void 0;
			this._contexts = void 0;
		}
	};
	exports.Emitter = class Emitter {
		_options;
		static _noop = function() {};
		_event;
		_callbacks;
		constructor(_options) {
			this._options = _options;
		}
		/**
		* For the public to allow to subscribe
		* to events from this Emitter
		*/
		get event() {
			if (!this._event) this._event = (listener, thisArgs, disposables) => {
				if (!this._callbacks) this._callbacks = new CallbackList();
				if (this._options && this._options.onFirstListenerAdd && this._callbacks.isEmpty()) this._options.onFirstListenerAdd(this);
				this._callbacks.add(listener, thisArgs);
				const result = { dispose: () => {
					if (!this._callbacks) return;
					this._callbacks.remove(listener, thisArgs);
					result.dispose = Emitter._noop;
					if (this._options && this._options.onLastListenerRemove && this._callbacks.isEmpty()) this._options.onLastListenerRemove(this);
				} };
				if (Array.isArray(disposables)) disposables.push(result);
				return result;
			};
			return this._event;
		}
		/**
		* To be kept private to fire an event to
		* subscribers
		*/
		fire(event) {
			if (this._callbacks) this._callbacks.invoke.call(this._callbacks, event);
		}
		dispose() {
			if (this._callbacks) {
				this._callbacks.dispose();
				this._callbacks = void 0;
			}
		}
	};
}));
// ../../../../../node_modules/.bun/vscode-jsonrpc@10.0.0/node_modules/vscode-jsonrpc/lib/common/cancellation.js
var require_cancellation = /* @__PURE__ */ __commonJSMin(((exports, module, this$7) => {
	var __createBinding = this$7 && this$7.__createBinding || (Object.create ? (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		var desc = Object.getOwnPropertyDescriptor(m, k);
		if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) desc = {
			enumerable: true,
			get: function() {
				return m[k];
			}
		};
		Object.defineProperty(o, k2, desc);
	}) : (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		o[k2] = m[k];
	}));
	var __setModuleDefault = this$7 && this$7.__setModuleDefault || (Object.create ? (function(o, v) {
		Object.defineProperty(o, "default", {
			enumerable: true,
			value: v
		});
	}) : function(o, v) {
		o["default"] = v;
	});
	var __importStar = this$7 && this$7.__importStar || (function() {
		var ownKeys = function(o) {
			ownKeys = Object.getOwnPropertyNames || function(o) {
				var ar = [];
				for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
				return ar;
			};
			return ownKeys(o);
		};
		return function(mod) {
			if (mod && mod.__esModule) return mod;
			var result = {};
			if (mod != null) {
				for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
			}
			__setModuleDefault(result, mod);
			return result;
		};
	})();
	var __importDefault = this$7 && this$7.__importDefault || function(mod) {
		return mod && mod.__esModule ? mod : { "default": mod };
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.CancellationTokenSource = exports.CancellationToken = void 0;
	const ral_1 = __importDefault(require_ral());
	const Is = __importStar(require_is());
	const events_1 = require_events();
	var CancellationToken;
	(function(CancellationToken) {
		CancellationToken.None = Object.freeze({
			isCancellationRequested: false,
			onCancellationRequested: events_1.Event.None
		});
		CancellationToken.Cancelled = Object.freeze({
			isCancellationRequested: true,
			onCancellationRequested: events_1.Event.None
		});
		function is(value) {
			const candidate = value;
			return candidate && (candidate === CancellationToken.None || candidate === CancellationToken.Cancelled || Is.boolean(candidate.isCancellationRequested) && !!candidate.onCancellationRequested);
		}
		CancellationToken.is = is;
	})(CancellationToken || (exports.CancellationToken = CancellationToken = {}));
	const shortcutEvent = Object.freeze(function(callback, context) {
		const handle = (0, ral_1.default)().timer.setTimeout(callback.bind(context), 0);
		return { dispose() {
			handle.dispose();
		} };
	});
	var MutableToken = class {
		_isCancelled = false;
		_emitter;
		cancel() {
			if (!this._isCancelled) {
				this._isCancelled = true;
				if (this._emitter) {
					this._emitter.fire(void 0);
					this.dispose();
				}
			}
		}
		get isCancellationRequested() {
			return this._isCancelled;
		}
		get onCancellationRequested() {
			if (this._isCancelled) return shortcutEvent;
			if (!this._emitter) this._emitter = new events_1.Emitter();
			return this._emitter.event;
		}
		dispose() {
			if (this._emitter) {
				this._emitter.dispose();
				this._emitter = void 0;
			}
		}
	};
	var CancellationTokenSource = class {
		_token;
		get token() {
			if (!this._token) this._token = new MutableToken();
			return this._token;
		}
		cancel() {
			if (!this._token) this._token = CancellationToken.Cancelled;
			else this._token.cancel();
		}
		dispose() {
			if (!this._token) this._token = CancellationToken.None;
			else if (this._token instanceof MutableToken) this._token.dispose();
		}
	};
	exports.CancellationTokenSource = CancellationTokenSource;
}));
// ../../../../../node_modules/.bun/vscode-jsonrpc@10.0.0/node_modules/vscode-jsonrpc/lib/common/sharedArrayCancellation.js
var require_sharedArrayCancellation = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.SharedArrayReceiverStrategy = exports.SharedArraySenderStrategy = void 0;
	const cancellation_1 = require_cancellation();
	var CancellationState;
	(function(CancellationState) {
		CancellationState.Continue = 0;
		CancellationState.Cancelled = 1;
	})(CancellationState || (CancellationState = {}));
	var SharedArraySenderStrategy = class {
		buffers;
		constructor() {
			this.buffers = /* @__PURE__ */ new Map();
		}
		enableCancellation(request) {
			if (request.id === null) return;
			const buffer = new SharedArrayBuffer(4);
			const data = new Int32Array(buffer, 0, 1);
			data[0] = CancellationState.Continue;
			this.buffers.set(request.id, buffer);
			request.$cancellationData = buffer;
		}
		async sendCancellation(_conn, id) {
			const buffer = this.buffers.get(id);
			if (buffer === void 0) return;
			const data = new Int32Array(buffer, 0, 1);
			Atomics.store(data, 0, CancellationState.Cancelled);
		}
		cleanup(id) {
			this.buffers.delete(id);
		}
		dispose() {
			this.buffers.clear();
		}
	};
	exports.SharedArraySenderStrategy = SharedArraySenderStrategy;
	var SharedArrayBufferCancellationToken = class {
		data;
		constructor(buffer) {
			this.data = new Int32Array(buffer, 0, 1);
		}
		get isCancellationRequested() {
			return Atomics.load(this.data, 0) === CancellationState.Cancelled;
		}
		get onCancellationRequested() {
			throw new Error(`Cancellation over SharedArrayBuffer doesn't support cancellation events`);
		}
	};
	var SharedArrayBufferCancellationTokenSource = class {
		token;
		constructor(buffer) {
			this.token = new SharedArrayBufferCancellationToken(buffer);
		}
		cancel() {}
		dispose() {}
	};
	var SharedArrayReceiverStrategy = class {
		kind = "request";
		createCancellationTokenSource(request) {
			const buffer = request.$cancellationData;
			if (buffer === void 0) return new cancellation_1.CancellationTokenSource();
			return new SharedArrayBufferCancellationTokenSource(buffer);
		}
	};
	exports.SharedArrayReceiverStrategy = SharedArrayReceiverStrategy;
}));
// ../../../../../node_modules/.bun/vscode-jsonrpc@10.0.0/node_modules/vscode-jsonrpc/lib/common/semaphore.js
var require_semaphore = /* @__PURE__ */ __commonJSMin(((exports, module, this$6) => {
	var __importDefault = this$6 && this$6.__importDefault || function(mod) {
		return mod && mod.__esModule ? mod : { "default": mod };
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.Semaphore = void 0;
	const ral_1 = __importDefault(require_ral());
	var Semaphore = class {
		_capacity;
		_active;
		_waiting;
		constructor(capacity = 1) {
			if (capacity <= 0) throw new Error("Capacity must be greater than 0");
			this._capacity = capacity;
			this._active = 0;
			this._waiting = [];
		}
		lock(thunk) {
			return new Promise((resolve, reject) => {
				this._waiting.push({
					thunk,
					resolve,
					reject
				});
				this.runNext();
			});
		}
		get active() {
			return this._active;
		}
		runNext() {
			if (this._waiting.length === 0 || this._active === this._capacity) return;
			(0, ral_1.default)().timer.setImmediate(() => this.doRunNext());
		}
		doRunNext() {
			if (this._waiting.length === 0 || this._active === this._capacity) return;
			const next = this._waiting.shift();
			this._active++;
			if (this._active > this._capacity) throw new Error(`Too many thunks active`);
			try {
				const result = next.thunk();
				if (result instanceof Promise) result.then((value) => {
					this._active--;
					next.resolve(value);
					this.runNext();
				}, (err) => {
					this._active--;
					next.reject(err);
					this.runNext();
				});
				else {
					this._active--;
					next.resolve(result);
					this.runNext();
				}
			} catch (err) {
				this._active--;
				next.reject(err);
				this.runNext();
			}
		}
	};
	exports.Semaphore = Semaphore;
}));
// ../../../../../node_modules/.bun/vscode-jsonrpc@10.0.0/node_modules/vscode-jsonrpc/lib/common/messageReader.js
var require_messageReader = /* @__PURE__ */ __commonJSMin(((exports, module, this$5) => {
	var __createBinding = this$5 && this$5.__createBinding || (Object.create ? (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		var desc = Object.getOwnPropertyDescriptor(m, k);
		if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) desc = {
			enumerable: true,
			get: function() {
				return m[k];
			}
		};
		Object.defineProperty(o, k2, desc);
	}) : (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		o[k2] = m[k];
	}));
	var __setModuleDefault = this$5 && this$5.__setModuleDefault || (Object.create ? (function(o, v) {
		Object.defineProperty(o, "default", {
			enumerable: true,
			value: v
		});
	}) : function(o, v) {
		o["default"] = v;
	});
	var __importStar = this$5 && this$5.__importStar || (function() {
		var ownKeys = function(o) {
			ownKeys = Object.getOwnPropertyNames || function(o) {
				var ar = [];
				for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
				return ar;
			};
			return ownKeys(o);
		};
		return function(mod) {
			if (mod && mod.__esModule) return mod;
			var result = {};
			if (mod != null) {
				for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
			}
			__setModuleDefault(result, mod);
			return result;
		};
	})();
	var __importDefault = this$5 && this$5.__importDefault || function(mod) {
		return mod && mod.__esModule ? mod : { "default": mod };
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.ReadableStreamMessageReader = exports.AbstractMessageReader = exports.MessageReader = void 0;
	const ral_1 = __importDefault(require_ral());
	const Is = __importStar(require_is());
	const events_1 = require_events();
	const semaphore_1 = require_semaphore();
	var MessageReader;
	(function(MessageReader) {
		function is(value) {
			const candidate = value;
			return candidate && Is.func(candidate.listen) && Is.func(candidate.dispose) && Is.func(candidate.onError) && Is.func(candidate.onClose) && Is.func(candidate.onPartialMessage);
		}
		MessageReader.is = is;
	})(MessageReader || (exports.MessageReader = MessageReader = {}));
	var AbstractMessageReader = class {
		errorEmitter;
		closeEmitter;
		partialMessageEmitter;
		constructor() {
			this.errorEmitter = new events_1.Emitter();
			this.closeEmitter = new events_1.Emitter();
			this.partialMessageEmitter = new events_1.Emitter();
		}
		dispose() {
			this.errorEmitter.dispose();
			this.closeEmitter.dispose();
			this.partialMessageEmitter.dispose();
		}
		get onError() {
			return this.errorEmitter.event;
		}
		fireError(error) {
			this.errorEmitter.fire(this.asError(error));
		}
		get onClose() {
			return this.closeEmitter.event;
		}
		fireClose() {
			this.closeEmitter.fire(void 0);
		}
		get onPartialMessage() {
			return this.partialMessageEmitter.event;
		}
		firePartialMessage(info) {
			this.partialMessageEmitter.fire(info);
		}
		asError(error) {
			if (error instanceof Error) return error;
			else return /* @__PURE__ */ new Error(`Reader received error. Reason: ${Is.string(error.message) ? error.message : "unknown"}`);
		}
	};
	exports.AbstractMessageReader = AbstractMessageReader;
	var ResolvedMessageReaderOptions;
	(function(ResolvedMessageReaderOptions) {
		function fromOptions(options) {
			let charset;
			let contentDecoder;
			const contentDecoders = /* @__PURE__ */ new Map();
			let contentTypeDecoder;
			const contentTypeDecoders = /* @__PURE__ */ new Map();
			if (options === void 0 || typeof options === "string") charset = options ?? "utf-8";
			else {
				charset = options.charset ?? "utf-8";
				if (options.contentDecoder !== void 0) {
					contentDecoder = options.contentDecoder;
					contentDecoders.set(contentDecoder.name, contentDecoder);
				}
				if (options.contentDecoders !== void 0) for (const decoder of options.contentDecoders) contentDecoders.set(decoder.name, decoder);
				if (options.contentTypeDecoder !== void 0) {
					contentTypeDecoder = options.contentTypeDecoder;
					contentTypeDecoders.set(contentTypeDecoder.name, contentTypeDecoder);
				}
				if (options.contentTypeDecoders !== void 0) for (const decoder of options.contentTypeDecoders) contentTypeDecoders.set(decoder.name, decoder);
			}
			if (contentTypeDecoder === void 0) {
				contentTypeDecoder = (0, ral_1.default)().applicationJson.decoder;
				contentTypeDecoders.set(contentTypeDecoder.name, contentTypeDecoder);
			}
			return {
				charset,
				contentDecoder,
				contentDecoders,
				contentTypeDecoder,
				contentTypeDecoders
			};
		}
		ResolvedMessageReaderOptions.fromOptions = fromOptions;
	})(ResolvedMessageReaderOptions || (ResolvedMessageReaderOptions = {}));
	var ReadableStreamMessageReader = class extends AbstractMessageReader {
		readable;
		options;
		callback;
		nextMessageLength;
		messageToken;
		buffer;
		partialMessageTimer;
		_partialMessageTimeout;
		readSemaphore;
		constructor(readable, options) {
			super();
			this.readable = readable;
			this.options = ResolvedMessageReaderOptions.fromOptions(options);
			this.buffer = (0, ral_1.default)().messageBuffer.create(this.options.charset);
			this._partialMessageTimeout = 1e4;
			this.nextMessageLength = -1;
			this.messageToken = 0;
			this.readSemaphore = new semaphore_1.Semaphore(1);
		}
		set partialMessageTimeout(timeout) {
			this._partialMessageTimeout = timeout;
		}
		get partialMessageTimeout() {
			return this._partialMessageTimeout;
		}
		listen(callback) {
			this.nextMessageLength = -1;
			this.messageToken = 0;
			this.partialMessageTimer = void 0;
			this.callback = callback;
			const result = this.readable.onData((data) => {
				this.onData(data);
			});
			this.readable.onError((error) => this.fireError(error));
			this.readable.onClose(() => this.fireClose());
			return result;
		}
		onData(data) {
			try {
				this.buffer.append(data);
				while (true) {
					if (this.nextMessageLength === -1) {
						const headers = this.buffer.tryReadHeaders(true);
						if (!headers) return;
						const contentLength = headers.get("content-length");
						if (!contentLength) {
							this.fireError(/* @__PURE__ */ new Error(`Header must provide a Content-Length property.\n${JSON.stringify(Object.fromEntries(headers))}`));
							return;
						}
						const length = parseInt(contentLength);
						if (isNaN(length)) {
							this.fireError(/* @__PURE__ */ new Error(`Content-Length value must be a number. Got ${contentLength}`));
							return;
						}
						this.nextMessageLength = length;
					}
					const body = this.buffer.tryReadBody(this.nextMessageLength);
					if (body === void 0) {
						/** We haven't received the full message yet. */
						this.setPartialMessageTimer();
						return;
					}
					this.clearPartialMessageTimer();
					this.nextMessageLength = -1;
					this.readSemaphore.lock(async () => {
						const bytes = this.options.contentDecoder !== void 0 ? await this.options.contentDecoder.decode(body) : body;
						const message = await this.options.contentTypeDecoder.decode(bytes, this.options);
						this.callback(message);
					}).catch((error) => {
						this.fireError(error);
					});
				}
			} catch (error) {
				this.fireError(error);
			}
		}
		clearPartialMessageTimer() {
			if (this.partialMessageTimer) {
				this.partialMessageTimer.dispose();
				this.partialMessageTimer = void 0;
			}
		}
		setPartialMessageTimer() {
			this.clearPartialMessageTimer();
			if (this._partialMessageTimeout <= 0) return;
			this.partialMessageTimer = (0, ral_1.default)().timer.setTimeout((token, timeout) => {
				this.partialMessageTimer = void 0;
				if (token === this.messageToken) {
					this.firePartialMessage({
						messageToken: token,
						waitingTime: timeout
					});
					this.setPartialMessageTimer();
				}
			}, this._partialMessageTimeout, this.messageToken, this._partialMessageTimeout);
		}
	};
	exports.ReadableStreamMessageReader = ReadableStreamMessageReader;
}));
// ../../../../../node_modules/.bun/vscode-jsonrpc@10.0.0/node_modules/vscode-jsonrpc/lib/common/messageWriter.js
var require_messageWriter = /* @__PURE__ */ __commonJSMin(((exports, module, this$4) => {
	var __createBinding = this$4 && this$4.__createBinding || (Object.create ? (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		var desc = Object.getOwnPropertyDescriptor(m, k);
		if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) desc = {
			enumerable: true,
			get: function() {
				return m[k];
			}
		};
		Object.defineProperty(o, k2, desc);
	}) : (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		o[k2] = m[k];
	}));
	var __setModuleDefault = this$4 && this$4.__setModuleDefault || (Object.create ? (function(o, v) {
		Object.defineProperty(o, "default", {
			enumerable: true,
			value: v
		});
	}) : function(o, v) {
		o["default"] = v;
	});
	var __importStar = this$4 && this$4.__importStar || (function() {
		var ownKeys = function(o) {
			ownKeys = Object.getOwnPropertyNames || function(o) {
				var ar = [];
				for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
				return ar;
			};
			return ownKeys(o);
		};
		return function(mod) {
			if (mod && mod.__esModule) return mod;
			var result = {};
			if (mod != null) {
				for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
			}
			__setModuleDefault(result, mod);
			return result;
		};
	})();
	var __importDefault = this$4 && this$4.__importDefault || function(mod) {
		return mod && mod.__esModule ? mod : { "default": mod };
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.WriteableStreamMessageWriter = exports.AbstractMessageWriter = exports.MessageWriter = void 0;
	const ral_1 = __importDefault(require_ral());
	const Is = __importStar(require_is());
	const semaphore_1 = require_semaphore();
	const events_1 = require_events();
	const ContentLength = "Content-Length: ";
	const CRLF = "\r\n";
	var MessageWriter;
	(function(MessageWriter) {
		function is(value) {
			const candidate = value;
			return candidate && Is.func(candidate.dispose) && Is.func(candidate.onClose) && Is.func(candidate.onError) && Is.func(candidate.write);
		}
		MessageWriter.is = is;
	})(MessageWriter || (exports.MessageWriter = MessageWriter = {}));
	var AbstractMessageWriter = class {
		errorEmitter;
		closeEmitter;
		constructor() {
			this.errorEmitter = new events_1.Emitter();
			this.closeEmitter = new events_1.Emitter();
		}
		dispose() {
			this.errorEmitter.dispose();
			this.closeEmitter.dispose();
		}
		get onError() {
			return this.errorEmitter.event;
		}
		fireError(error, message, count) {
			this.errorEmitter.fire([
				this.asError(error),
				message,
				count
			]);
		}
		get onClose() {
			return this.closeEmitter.event;
		}
		fireClose() {
			this.closeEmitter.fire(void 0);
		}
		asError(error) {
			if (error instanceof Error) return error;
			else return /* @__PURE__ */ new Error(`Writer received error. Reason: ${Is.string(error.message) ? error.message : "unknown"}`);
		}
	};
	exports.AbstractMessageWriter = AbstractMessageWriter;
	var ResolvedMessageWriterOptions;
	(function(ResolvedMessageWriterOptions) {
		function fromOptions(options) {
			if (options === void 0 || typeof options === "string") return {
				charset: options ?? "utf-8",
				contentTypeEncoder: (0, ral_1.default)().applicationJson.encoder
			};
			else return {
				charset: options.charset ?? "utf-8",
				contentEncoder: options.contentEncoder,
				contentTypeEncoder: options.contentTypeEncoder ?? (0, ral_1.default)().applicationJson.encoder
			};
		}
		ResolvedMessageWriterOptions.fromOptions = fromOptions;
	})(ResolvedMessageWriterOptions || (ResolvedMessageWriterOptions = {}));
	var WriteableStreamMessageWriter = class extends AbstractMessageWriter {
		writable;
		options;
		errorCount;
		writeSemaphore;
		constructor(writable, options) {
			super();
			this.writable = writable;
			this.options = ResolvedMessageWriterOptions.fromOptions(options);
			this.errorCount = 0;
			this.writeSemaphore = new semaphore_1.Semaphore(1);
			this.writable.onError((error) => this.fireError(error));
			this.writable.onClose(() => this.fireClose());
		}
		async write(msg) {
			return this.writeSemaphore.lock(async () => {
				return this.options.contentTypeEncoder.encode(msg, this.options).then((buffer) => {
					if (this.options.contentEncoder !== void 0) return this.options.contentEncoder.encode(buffer);
					else return buffer;
				}).then((buffer) => {
					const headers = [];
					headers.push(ContentLength, buffer.byteLength.toString(), CRLF);
					headers.push(CRLF);
					return this.doWrite(msg, headers, buffer);
				}, (error) => {
					this.fireError(error);
					throw error;
				});
			});
		}
		async doWrite(msg, headers, data) {
			try {
				await this.writable.write(headers.join(""), "ascii");
				return this.writable.write(data);
			} catch (error) {
				this.handleError(error, msg);
				return Promise.reject(error);
			}
		}
		handleError(error, msg) {
			this.errorCount++;
			this.fireError(error, msg, this.errorCount);
		}
		end() {
			this.writable.end();
		}
	};
	exports.WriteableStreamMessageWriter = WriteableStreamMessageWriter;
}));
// ../../../../../node_modules/.bun/vscode-jsonrpc@10.0.0/node_modules/vscode-jsonrpc/lib/common/messageBuffer.js
var require_messageBuffer = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.AbstractMessageBuffer = void 0;
	const CR = 13;
	const LF = 10;
	const CRLF = "\r\n";
	var AbstractMessageBuffer = class {
		_encoding;
		_chunks;
		_totalLength;
		constructor(encoding = "utf-8") {
			this._encoding = encoding;
			this._chunks = [];
			this._totalLength = 0;
		}
		get encoding() {
			return this._encoding;
		}
		append(chunk) {
			const toAppend = typeof chunk === "string" ? this.fromString(chunk, this._encoding) : chunk;
			this._chunks.push(toAppend);
			this._totalLength += toAppend.byteLength;
		}
		tryReadHeaders(lowerCaseKeys = false) {
			if (this._chunks.length === 0) return;
			let state = 0;
			let chunkIndex = 0;
			let offset = 0;
			let chunkBytesRead = 0;
			row: while (chunkIndex < this._chunks.length) {
				const chunk = this._chunks[chunkIndex];
				offset = 0;
				while (offset < chunk.length) {
					switch (chunk[offset]) {
						case CR:
							switch (state) {
								case 0:
									state = 1;
									break;
								case 2:
									state = 3;
									break;
								default: state = 0;
							}
							break;
						case LF:
							switch (state) {
								case 1:
									state = 2;
									break;
								case 3:
									state = 4;
									offset++;
									break row;
								default: state = 0;
							}
							break;
						default: state = 0;
					}
					offset++;
				}
				chunkBytesRead += chunk.byteLength;
				chunkIndex++;
			}
			if (state !== 4) return;
			const buffer = this._read(chunkBytesRead + offset);
			const result = /* @__PURE__ */ new Map();
			const headers = this.toString(buffer, "ascii").split(CRLF);
			if (headers.length < 2) return result;
			for (let i = 0; i < headers.length - 2; i++) {
				const header = headers[i];
				const index = header.indexOf(":");
				if (index === -1) throw new Error(`Message header must separate key and value using ':'\n${header}`);
				const key = header.substr(0, index);
				const value = header.substr(index + 1).trim();
				result.set(lowerCaseKeys ? key.toLowerCase() : key, value);
			}
			return result;
		}
		tryReadBody(length) {
			if (this._totalLength < length) return;
			return this._read(length);
		}
		get numberOfBytes() {
			return this._totalLength;
		}
		_read(byteCount) {
			if (byteCount === 0) return this.emptyBuffer();
			if (byteCount > this._totalLength) throw new Error(`Cannot read so many bytes!`);
			if (this._chunks[0].byteLength === byteCount) {
				const chunk = this._chunks[0];
				this._chunks.shift();
				this._totalLength -= byteCount;
				return this.asNative(chunk);
			}
			if (this._chunks[0].byteLength > byteCount) {
				const chunk = this._chunks[0];
				const result = this.asNative(chunk, byteCount);
				this._chunks[0] = chunk.slice(byteCount);
				this._totalLength -= byteCount;
				return result;
			}
			const result = this.allocNative(byteCount);
			let resultOffset = 0;
			const chunkIndex = 0;
			while (byteCount > 0) {
				const chunk = this._chunks[chunkIndex];
				if (chunk.byteLength > byteCount) {
					const chunkPart = chunk.slice(0, byteCount);
					result.set(chunkPart, resultOffset);
					resultOffset += byteCount;
					this._chunks[chunkIndex] = chunk.slice(byteCount);
					this._totalLength -= byteCount;
					byteCount -= byteCount;
				} else {
					result.set(chunk, resultOffset);
					resultOffset += chunk.byteLength;
					this._chunks.shift();
					this._totalLength -= chunk.byteLength;
					byteCount -= chunk.byteLength;
				}
			}
			return result;
		}
	};
	exports.AbstractMessageBuffer = AbstractMessageBuffer;
}));
// ../../../../../node_modules/.bun/vscode-jsonrpc@10.0.0/node_modules/vscode-jsonrpc/lib/common/connection.js
var require_connection = /* @__PURE__ */ __commonJSMin(((exports, module, this$3) => {
	var __createBinding = this$3 && this$3.__createBinding || (Object.create ? (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		var desc = Object.getOwnPropertyDescriptor(m, k);
		if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) desc = {
			enumerable: true,
			get: function() {
				return m[k];
			}
		};
		Object.defineProperty(o, k2, desc);
	}) : (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		o[k2] = m[k];
	}));
	var __setModuleDefault = this$3 && this$3.__setModuleDefault || (Object.create ? (function(o, v) {
		Object.defineProperty(o, "default", {
			enumerable: true,
			value: v
		});
	}) : function(o, v) {
		o["default"] = v;
	});
	var __importStar = this$3 && this$3.__importStar || (function() {
		var ownKeys = function(o) {
			ownKeys = Object.getOwnPropertyNames || function(o) {
				var ar = [];
				for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
				return ar;
			};
			return ownKeys(o);
		};
		return function(mod) {
			if (mod && mod.__esModule) return mod;
			var result = {};
			if (mod != null) {
				for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
			}
			__setModuleDefault(result, mod);
			return result;
		};
	})();
	var __importDefault = this$3 && this$3.__importDefault || function(mod) {
		return mod && mod.__esModule ? mod : { "default": mod };
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.ConnectionOptions = exports.MessageStrategy = exports.CancellationStrategy = exports.CancellationSenderStrategy = exports.CancellationReceiverStrategy = exports.RequestCancellationReceiverStrategy = exports.IdCancellationReceiverStrategy = exports.ConnectionStrategy = exports.ConnectionError = exports.ConnectionErrors = exports.LogTraceNotification = exports.SetTraceNotification = exports.TraceFormat = exports.TraceValues = exports.TraceValue = exports.Trace = exports.NullLogger = exports.ProgressType = exports.ProgressToken = void 0;
	exports.createMessageConnection = createMessageConnection;
	const ral_1 = __importDefault(require_ral());
	const Is = __importStar(require_is());
	const messages_1 = require_messages();
	const linkedMap_1 = require_linkedMap();
	const events_1 = require_events();
	const cancellation_1 = require_cancellation();
	var CancelNotification;
	(function(CancelNotification) {
		CancelNotification.type = new messages_1.NotificationType("$/cancelRequest");
	})(CancelNotification || (CancelNotification = {}));
	var ProgressToken;
	(function(ProgressToken) {
		function is(value) {
			return typeof value === "string" || typeof value === "number";
		}
		ProgressToken.is = is;
	})(ProgressToken || (exports.ProgressToken = ProgressToken = {}));
	var ProgressNotification;
	(function(ProgressNotification) {
		ProgressNotification.type = new messages_1.NotificationType("$/progress");
	})(ProgressNotification || (ProgressNotification = {}));
	var ProgressType = class {
		/**
		* Clients must not use these properties. They are here to ensure correct typing.
		* in TypeScript
		*/
		__;
		_pr;
		constructor() {}
	};
	exports.ProgressType = ProgressType;
	var StarRequestHandler;
	(function(StarRequestHandler) {
		function is(value) {
			return Is.func(value);
		}
		StarRequestHandler.is = is;
	})(StarRequestHandler || (StarRequestHandler = {}));
	exports.NullLogger = Object.freeze({
		error: () => {},
		warn: () => {},
		info: () => {},
		log: () => {}
	});
	var Trace;
	(function(Trace) {
		Trace[Trace["Off"] = 0] = "Off";
		Trace[Trace["Messages"] = 1] = "Messages";
		Trace[Trace["Compact"] = 2] = "Compact";
		Trace[Trace["Verbose"] = 3] = "Verbose";
	})(Trace || (exports.Trace = Trace = {}));
	var TraceValue;
	(function(TraceValue) {
		/**
		* Turn tracing off.
		*/
		TraceValue.Off = "off";
		/**
		* Trace messages only.
		*/
		TraceValue.Messages = "messages";
		/**
		* Compact message tracing.
		*/
		TraceValue.Compact = "compact";
		/**
		* Verbose message tracing.
		*/
		TraceValue.Verbose = "verbose";
	})(TraceValue || (exports.TraceValue = TraceValue = {}));
	/**
	* @deprecated Use TraceValue instead
	*/
	exports.TraceValues = TraceValue;
	(function(Trace) {
		function fromString(value) {
			if (!Is.string(value)) return Trace.Off;
			value = value.toLowerCase();
			switch (value) {
				case "off": return Trace.Off;
				case "messages": return Trace.Messages;
				case "compact": return Trace.Compact;
				case "verbose": return Trace.Verbose;
				default: return Trace.Off;
			}
		}
		Trace.fromString = fromString;
		function toString(value) {
			switch (value) {
				case Trace.Off: return "off";
				case Trace.Messages: return "messages";
				case Trace.Compact: return "compact";
				case Trace.Verbose: return "verbose";
				default: return "off";
			}
		}
		Trace.toString = toString;
	})(Trace || (exports.Trace = Trace = {}));
	var TraceFormat;
	(function(TraceFormat) {
		TraceFormat["Text"] = "text";
		TraceFormat["JSON"] = "json";
	})(TraceFormat || (exports.TraceFormat = TraceFormat = {}));
	(function(TraceFormat) {
		function fromString(value) {
			if (!Is.string(value)) return TraceFormat.Text;
			value = value.toLowerCase();
			if (value === "json") return TraceFormat.JSON;
			else return TraceFormat.Text;
		}
		TraceFormat.fromString = fromString;
	})(TraceFormat || (exports.TraceFormat = TraceFormat = {}));
	var SetTraceNotification;
	(function(SetTraceNotification) {
		SetTraceNotification.type = new messages_1.NotificationType("$/setTrace");
	})(SetTraceNotification || (exports.SetTraceNotification = SetTraceNotification = {}));
	var LogTraceNotification;
	(function(LogTraceNotification) {
		LogTraceNotification.type = new messages_1.NotificationType("$/logTrace");
	})(LogTraceNotification || (exports.LogTraceNotification = LogTraceNotification = {}));
	var ConnectionErrors;
	(function(ConnectionErrors) {
		/**
		* The connection is closed.
		*/
		ConnectionErrors[ConnectionErrors["Closed"] = 1] = "Closed";
		/**
		* The connection got disposed.
		*/
		ConnectionErrors[ConnectionErrors["Disposed"] = 2] = "Disposed";
		/**
		* The connection is already in listening mode.
		*/
		ConnectionErrors[ConnectionErrors["AlreadyListening"] = 3] = "AlreadyListening";
	})(ConnectionErrors || (exports.ConnectionErrors = ConnectionErrors = {}));
	var ConnectionError = class ConnectionError extends Error {
		code;
		constructor(code, message) {
			super(message);
			this.code = code;
			Object.setPrototypeOf(this, ConnectionError.prototype);
		}
	};
	exports.ConnectionError = ConnectionError;
	var ConnectionStrategy;
	(function(ConnectionStrategy) {
		function is(value) {
			const candidate = value;
			return candidate && Is.func(candidate.cancelUndispatched);
		}
		ConnectionStrategy.is = is;
	})(ConnectionStrategy || (exports.ConnectionStrategy = ConnectionStrategy = {}));
	var IdCancellationReceiverStrategy;
	(function(IdCancellationReceiverStrategy) {
		function is(value) {
			const candidate = value;
			return candidate && (candidate.kind === void 0 || candidate.kind === "id") && Is.func(candidate.createCancellationTokenSource) && (candidate.dispose === void 0 || Is.func(candidate.dispose));
		}
		IdCancellationReceiverStrategy.is = is;
	})(IdCancellationReceiverStrategy || (exports.IdCancellationReceiverStrategy = IdCancellationReceiverStrategy = {}));
	var RequestCancellationReceiverStrategy;
	(function(RequestCancellationReceiverStrategy) {
		function is(value) {
			const candidate = value;
			return candidate && candidate.kind === "request" && Is.func(candidate.createCancellationTokenSource) && (candidate.dispose === void 0 || Is.func(candidate.dispose));
		}
		RequestCancellationReceiverStrategy.is = is;
	})(RequestCancellationReceiverStrategy || (exports.RequestCancellationReceiverStrategy = RequestCancellationReceiverStrategy = {}));
	var CancellationReceiverStrategy;
	(function(CancellationReceiverStrategy) {
		CancellationReceiverStrategy.Message = Object.freeze({ createCancellationTokenSource(_) {
			return new cancellation_1.CancellationTokenSource();
		} });
		function is(value) {
			return IdCancellationReceiverStrategy.is(value) || RequestCancellationReceiverStrategy.is(value);
		}
		CancellationReceiverStrategy.is = is;
	})(CancellationReceiverStrategy || (exports.CancellationReceiverStrategy = CancellationReceiverStrategy = {}));
	var CancellationSenderStrategy;
	(function(CancellationSenderStrategy) {
		CancellationSenderStrategy.Message = Object.freeze({
			sendCancellation(conn, id) {
				return conn.sendNotification(CancelNotification.type, { id });
			},
			cleanup(_) {}
		});
		function is(value) {
			const candidate = value;
			return candidate && Is.func(candidate.sendCancellation) && Is.func(candidate.cleanup);
		}
		CancellationSenderStrategy.is = is;
	})(CancellationSenderStrategy || (exports.CancellationSenderStrategy = CancellationSenderStrategy = {}));
	var CancellationStrategy;
	(function(CancellationStrategy) {
		CancellationStrategy.Message = Object.freeze({
			receiver: CancellationReceiverStrategy.Message,
			sender: CancellationSenderStrategy.Message
		});
		function is(value) {
			const candidate = value;
			return candidate && CancellationReceiverStrategy.is(candidate.receiver) && CancellationSenderStrategy.is(candidate.sender);
		}
		CancellationStrategy.is = is;
	})(CancellationStrategy || (exports.CancellationStrategy = CancellationStrategy = {}));
	var MessageStrategy;
	(function(MessageStrategy) {
		function is(value) {
			const candidate = value;
			return candidate && Is.func(candidate.handleMessage);
		}
		MessageStrategy.is = is;
	})(MessageStrategy || (exports.MessageStrategy = MessageStrategy = {}));
	var ConnectionOptions;
	(function(ConnectionOptions) {
		function is(value) {
			const candidate = value;
			return candidate && (CancellationStrategy.is(candidate.cancellationStrategy) || ConnectionStrategy.is(candidate.connectionStrategy) || MessageStrategy.is(candidate.messageStrategy) || Is.number(candidate.maxParallelism));
		}
		ConnectionOptions.is = is;
	})(ConnectionOptions || (exports.ConnectionOptions = ConnectionOptions = {}));
	var ConnectionState;
	(function(ConnectionState) {
		ConnectionState[ConnectionState["New"] = 1] = "New";
		ConnectionState[ConnectionState["Listening"] = 2] = "Listening";
		ConnectionState[ConnectionState["Closed"] = 3] = "Closed";
		ConnectionState[ConnectionState["Disposed"] = 4] = "Disposed";
	})(ConnectionState || (ConnectionState = {}));
	function createMessageConnection(messageReader, messageWriter, _logger, options) {
		const logger = _logger !== void 0 ? _logger : exports.NullLogger;
		let sequenceNumber = 0;
		let notificationSequenceNumber = 0;
		let unknownResponseSequenceNumber = 0;
		const version = "2.0";
		const maxParallelism = options?.maxParallelism ?? -1;
		let inFlight = 0;
		let starRequestHandler = void 0;
		const requestHandlers = /* @__PURE__ */ new Map();
		let starNotificationHandler = void 0;
		const notificationHandlers = /* @__PURE__ */ new Map();
		const progressHandlers = /* @__PURE__ */ new Map();
		let timer;
		let messageQueue = new linkedMap_1.LinkedMap();
		let responsePromises = /* @__PURE__ */ new Map();
		let knownCanceledRequests = /* @__PURE__ */ new Set();
		let requestTokens = /* @__PURE__ */ new Map();
		let trace = Trace.Off;
		let traceFormat = TraceFormat.Text;
		let tracer;
		let state = ConnectionState.New;
		const errorEmitter = new events_1.Emitter();
		const closeEmitter = new events_1.Emitter();
		const unhandledNotificationEmitter = new events_1.Emitter();
		const unhandledProgressEmitter = new events_1.Emitter();
		const disposeEmitter = new events_1.Emitter();
		const cancellationStrategy = options && options.cancellationStrategy ? options.cancellationStrategy : CancellationStrategy.Message;
		function cancelUndispatched(_message) {}
		function isListening() {
			return state === ConnectionState.Listening;
		}
		function isClosed() {
			return state === ConnectionState.Closed;
		}
		function isDisposed() {
			return state === ConnectionState.Disposed;
		}
		function closeHandler() {
			if (state === ConnectionState.New || state === ConnectionState.Listening) {
				state = ConnectionState.Closed;
				closeEmitter.fire(void 0);
			}
		}
		function readErrorHandler(error) {
			errorEmitter.fire([
				error,
				void 0,
				void 0
			]);
		}
		function writeErrorHandler(data) {
			errorEmitter.fire(data);
		}
		messageReader.onClose(closeHandler);
		messageReader.onError(readErrorHandler);
		messageWriter.onClose(closeHandler);
		messageWriter.onError(writeErrorHandler);
		function createRequestQueueKey(id) {
			if (id === null) throw new Error(`Can't send requests with id null since the response can't be correlated.`);
			return "req-" + id.toString();
		}
		function createResponseQueueKey(id) {
			if (id === null) return "res-unknown-" + (++unknownResponseSequenceNumber).toString();
			else return "res-" + id.toString();
		}
		function createNotificationQueueKey() {
			return "not-" + (++notificationSequenceNumber).toString();
		}
		function addMessageToQueue(queue, message) {
			if (messages_1.Message.isRequest(message)) queue.set(createRequestQueueKey(message.id), message);
			else if (messages_1.Message.isResponse(message)) {
				if (maxParallelism === -1) queue.set(createResponseQueueKey(message.id), message);
				else handleResponse(message);
			} else queue.set(createNotificationQueueKey(), message);
		}
		function triggerMessageQueue() {
			if (timer || messageQueue.size === 0) return;
			if (maxParallelism !== -1 && inFlight >= maxParallelism) return;
			timer = (0, ral_1.default)().timer.setImmediate(async () => {
				timer = void 0;
				if (messageQueue.size === 0) return;
				if (maxParallelism !== -1 && inFlight >= maxParallelism) return;
				const message = messageQueue.shift();
				let result;
				try {
					inFlight++;
					const messageStrategy = options?.messageStrategy;
					if (MessageStrategy.is(messageStrategy)) result = messageStrategy.handleMessage(message, handleMessage);
					else result = handleMessage(message);
				} catch (error) {
					logger.error(`Processing message queue failed: ${error.toString()}`);
				} finally {
					if (result instanceof Promise) result.then(() => {}).catch((error) => {
						logger.error(`Processing message queue failed: ${error.toString()}`);
					}).finally(() => {
						inFlight--;
						triggerMessageQueue();
					});
					else inFlight--;
					triggerMessageQueue();
				}
			});
		}
		async function handleMessage(message) {
			if (messages_1.Message.isRequest(message)) return handleRequest(message);
			else if (messages_1.Message.isNotification(message)) return handleNotification(message);
			else if (messages_1.Message.isResponse(message)) return handleResponse(message);
			else return handleInvalidMessage(message);
		}
		const callback = (message) => {
			try {
				if (messages_1.Message.isNotification(message) && message.method === CancelNotification.type.method) {
					const cancelId = message.params.id;
					const key = createRequestQueueKey(cancelId);
					const toCancel = messageQueue.get(key);
					if (messages_1.Message.isRequest(toCancel)) {
						const strategy = options?.connectionStrategy;
						const response = strategy && strategy.cancelUndispatched ? strategy.cancelUndispatched(toCancel, cancelUndispatched) : void 0;
						if (response && (response.error !== void 0 || response.result !== void 0)) {
							messageQueue.delete(key);
							requestTokens.delete(cancelId);
							response.id = toCancel.id;
							traceSendingResponse(response, message.method, Date.now());
							messageWriter.write(response).catch(() => logger.error(`Sending response for canceled message failed.`));
							return;
						}
					}
					const cancellationToken = requestTokens.get(cancelId);
					if (cancellationToken !== void 0) {
						cancellationToken.cancel();
						traceReceivedNotification(message);
						return;
					} else knownCanceledRequests.add(cancelId);
				}
				addMessageToQueue(messageQueue, message);
			} finally {
				triggerMessageQueue();
			}
		};
		async function handleRequest(requestMessage) {
			if (isDisposed()) return Promise.resolve();
			function reply(resultOrError, method, startTime) {
				const message = {
					jsonrpc: version,
					id: requestMessage.id
				};
				if (resultOrError instanceof messages_1.ResponseError) message.error = resultOrError.toJson();
				else message.result = resultOrError === void 0 ? null : resultOrError;
				traceSendingResponse(message, method, startTime);
				return messageWriter.write(message);
			}
			function replyError(error, method, startTime) {
				const message = {
					jsonrpc: version,
					id: requestMessage.id,
					error: error.toJson()
				};
				traceSendingResponse(message, method, startTime);
				return messageWriter.write(message);
			}
			traceReceivedRequest(requestMessage);
			const element = requestHandlers.get(requestMessage.method);
			let type;
			let requestHandler;
			if (element) {
				type = element.type;
				requestHandler = element.handler;
			}
			const startTime = Date.now();
			if (requestHandler || starRequestHandler) {
				const tokenKey = requestMessage.id ?? String(Date.now());
				const cancellationSource = IdCancellationReceiverStrategy.is(cancellationStrategy.receiver) ? cancellationStrategy.receiver.createCancellationTokenSource(tokenKey) : cancellationStrategy.receiver.createCancellationTokenSource(requestMessage);
				if (requestMessage.id !== null && knownCanceledRequests.has(requestMessage.id)) cancellationSource.cancel();
				if (requestMessage.id !== null) requestTokens.set(tokenKey, cancellationSource);
				try {
					let handlerResult;
					if (requestHandler) {
						if (requestMessage.params === void 0) {
							if (type !== void 0 && type.numberOfParams !== 0) return replyError(new messages_1.ResponseError(messages_1.ErrorCodes.InvalidParams, `Request ${requestMessage.method} defines ${type.numberOfParams} params but received none.`), requestMessage.method, startTime);
							handlerResult = requestHandler(cancellationSource.token);
						} else if (Array.isArray(requestMessage.params)) {
							if (type !== void 0 && type.parameterStructures === messages_1.ParameterStructures.byName) return replyError(new messages_1.ResponseError(messages_1.ErrorCodes.InvalidParams, `Request ${requestMessage.method} defines parameters by name but received parameters by position`), requestMessage.method, startTime);
							handlerResult = requestHandler(...requestMessage.params, cancellationSource.token);
						} else {
							if (type !== void 0 && type.parameterStructures === messages_1.ParameterStructures.byPosition) return replyError(new messages_1.ResponseError(messages_1.ErrorCodes.InvalidParams, `Request ${requestMessage.method} defines parameters by position but received parameters by name`), requestMessage.method, startTime);
							handlerResult = requestHandler(requestMessage.params, cancellationSource.token);
						}
					} else if (starRequestHandler) handlerResult = starRequestHandler(requestMessage.method, requestMessage.params, cancellationSource.token);
					await reply(await handlerResult, requestMessage.method, startTime);
				} catch (error) {
					if (error instanceof messages_1.ResponseError) await reply(error, requestMessage.method, startTime);
					else if (error && Is.string(error.message)) await replyError(new messages_1.ResponseError(messages_1.ErrorCodes.InternalError, `Request ${requestMessage.method} failed with message: ${error.message}`), requestMessage.method, startTime);
					else await replyError(new messages_1.ResponseError(messages_1.ErrorCodes.InternalError, `Request ${requestMessage.method} failed unexpectedly without providing any details.`), requestMessage.method, startTime);
				} finally {
					requestTokens.delete(tokenKey);
				}
			} else await replyError(new messages_1.ResponseError(messages_1.ErrorCodes.MethodNotFound, `Unhandled method ${requestMessage.method}`), requestMessage.method, startTime);
		}
		function handleResponse(responseMessage) {
			if (isDisposed()) return;
			if (responseMessage.id === null) {
				if (responseMessage.error) logger.error(`Received response message without id: Error is: \n${JSON.stringify(responseMessage.error, void 0, 4)}`);
				else logger.error(`Received response message without id. No further error information provided.`);
			} else {
				const key = responseMessage.id;
				const responsePromise = responsePromises.get(key);
				traceReceivedResponse(responseMessage, responsePromise);
				if (responsePromise !== void 0) {
					responsePromises.delete(key);
					try {
						if (responseMessage.error) {
							const error = responseMessage.error;
							responsePromise.reject(new messages_1.ResponseError(error.code, error.message, error.data));
						} else if (responseMessage.result !== void 0) responsePromise.resolve(responseMessage.result);
						else throw new Error("Should never happen.");
					} catch (error) {
						if (error.message) logger.error(`Response handler '${responsePromise.method}' failed with message: ${error.message}`);
						else logger.error(`Response handler '${responsePromise.method}' failed unexpectedly.`);
					}
				}
			}
		}
		async function handleNotification(message) {
			if (isDisposed()) return;
			let type = void 0;
			let notificationHandler;
			if (message.method === CancelNotification.type.method) {
				const cancelId = message.params.id;
				knownCanceledRequests.delete(cancelId);
				traceReceivedNotification(message);
				return;
			} else {
				const element = notificationHandlers.get(message.method);
				if (element) {
					notificationHandler = element.handler;
					type = element.type;
				}
			}
			if (notificationHandler || starNotificationHandler) try {
				traceReceivedNotification(message);
				if (notificationHandler) {
					if (message.params === void 0) {
						if (type !== void 0) {
							if (type.numberOfParams !== 0 && type.parameterStructures !== messages_1.ParameterStructures.byName) logger.error(`Notification ${message.method} defines ${type.numberOfParams} params but received none.`);
						}
						await notificationHandler();
					} else if (Array.isArray(message.params)) {
						const params = message.params;
						if (message.method === ProgressNotification.type.method && params.length === 2 && ProgressToken.is(params[0])) await notificationHandler({
							token: params[0],
							value: params[1]
						});
						else {
							if (type !== void 0) {
								if (type.parameterStructures === messages_1.ParameterStructures.byName) logger.error(`Notification ${message.method} defines parameters by name but received parameters by position`);
								if (type.numberOfParams !== message.params.length) logger.error(`Notification ${message.method} defines ${type.numberOfParams} params but received ${params.length} arguments`);
							}
							await notificationHandler(...params);
						}
					} else {
						if (type !== void 0 && type.parameterStructures === messages_1.ParameterStructures.byPosition) logger.error(`Notification ${message.method} defines parameters by position but received parameters by name`);
						await notificationHandler(message.params);
					}
				} else if (starNotificationHandler) await starNotificationHandler(message.method, message.params);
			} catch (error) {
				if (error.message) logger.error(`Notification handler '${message.method}' failed with message: ${error.message}`);
				else logger.error(`Notification handler '${message.method}' failed unexpectedly.`);
			}
			else unhandledNotificationEmitter.fire(message);
		}
		function handleInvalidMessage(message) {
			if (!message) {
				logger.error("Received empty message.");
				return;
			}
			logger.error(`Received message which is neither a response nor a notification message:\n${JSON.stringify(message, null, 4)}`);
			const responseMessage = message;
			if (Is.string(responseMessage.id) || Is.number(responseMessage.id)) {
				const key = responseMessage.id;
				const responseHandler = responsePromises.get(key);
				if (responseHandler) responseHandler.reject(/* @__PURE__ */ new Error("The received response has neither a result nor an error property."));
			}
		}
		function stringifyTrace(params) {
			if (params === void 0 || params === null) return;
			switch (trace) {
				case Trace.Verbose: return JSON.stringify(params, null, 4);
				case Trace.Compact: return JSON.stringify(params);
				default: return;
			}
		}
		function traceSendingRequest(message) {
			if (trace === Trace.Off || !tracer) return;
			if (traceFormat === TraceFormat.Text) {
				let data = void 0;
				if ((trace === Trace.Verbose || trace === Trace.Compact) && message.params) data = `Params: ${stringifyTrace(message.params)}`;
				tracer.log(`Sending request '${message.method} - (${message.id})'.`, data);
			} else logLSPMessage("send-request", message);
		}
		function traceSendingNotification(message) {
			if (trace === Trace.Off || !tracer) return;
			if (traceFormat === TraceFormat.Text) {
				let data = void 0;
				if (trace === Trace.Verbose || trace === Trace.Compact) {
					if (message.params) data = `Params: ${stringifyTrace(message.params)}`;
					else data = "No parameters provided.";
				}
				tracer.log(`Sending notification '${message.method}'.`, data);
			} else logLSPMessage("send-notification", message);
		}
		function traceSendingResponse(message, method, startTime) {
			if (trace === Trace.Off || !tracer) return;
			if (traceFormat === TraceFormat.Text) {
				let data = void 0;
				if (trace === Trace.Verbose || trace === Trace.Compact) {
					if (message.error && message.error.data) data = `Error data: ${stringifyTrace(message.error.data)}`;
					else if (message.result) data = `Result: ${stringifyTrace(message.result)}`;
					else if (message.error === void 0) data = "No result returned.";
				}
				const error = message.error ? ` Request failed: ${message.error.message} (${message.error.code}).` : "";
				tracer.log(`Sending response '${method} - (${message.id})'. Processing request took ${Date.now() - startTime}ms.${error}`, data);
			} else logLSPMessage("send-response", message);
		}
		function traceReceivedRequest(message) {
			if (trace === Trace.Off || !tracer) return;
			if (traceFormat === TraceFormat.Text) {
				let data = void 0;
				if ((trace === Trace.Verbose || trace === Trace.Compact) && message.params) data = `Params: ${stringifyTrace(message.params)}`;
				tracer.log(`Received request '${message.method} - (${message.id})'.`, data);
			} else logLSPMessage("receive-request", message);
		}
		function traceReceivedNotification(message) {
			if (trace === Trace.Off || !tracer || message.method === LogTraceNotification.type.method) return;
			if (traceFormat === TraceFormat.Text) {
				let data = void 0;
				if (trace === Trace.Verbose || trace === Trace.Compact) {
					if (message.params) data = `Params: ${stringifyTrace(message.params)}`;
					else data = "No parameters provided.";
				}
				tracer.log(`Received notification '${message.method}'.`, data);
			} else logLSPMessage("receive-notification", message);
		}
		function traceReceivedResponse(message, responsePromise) {
			if (trace === Trace.Off || !tracer) return;
			if (traceFormat === TraceFormat.Text) {
				let data = void 0;
				if (trace === Trace.Verbose || trace === Trace.Compact) {
					if (message.error && message.error.data) data = `Error data: ${stringifyTrace(message.error.data)}`;
					else if (message.result) data = `Result: ${stringifyTrace(message.result)}`;
					else if (message.error === void 0) data = "No result returned.";
				}
				if (responsePromise) {
					const error = message.error ? ` Request failed: ${message.error.message} (${message.error.code}).` : "";
					tracer.log(`Received response '${responsePromise.method} - (${message.id})' in ${Date.now() - responsePromise.timerStart}ms.${error}`, data);
				} else tracer.log(`Received response ${message.id} without active response promise.`, data);
			} else logLSPMessage("receive-response", message);
		}
		function logLSPMessage(type, message) {
			if (!tracer || trace === Trace.Off) return;
			const lspMessage = {
				isLSPMessage: true,
				type,
				message,
				timestamp: Date.now()
			};
			tracer.log(lspMessage);
		}
		function throwIfClosedOrDisposed() {
			if (isClosed()) throw new ConnectionError(ConnectionErrors.Closed, "Connection is closed.");
			if (isDisposed()) throw new ConnectionError(ConnectionErrors.Disposed, "Connection is disposed.");
		}
		function throwIfListening() {
			if (isListening()) throw new ConnectionError(ConnectionErrors.AlreadyListening, "Connection is already listening");
		}
		function throwIfNotListening() {
			if (!isListening()) throw new Error("Call listen() first.");
		}
		function undefinedToNull(param) {
			if (param === void 0) return null;
			else return param;
		}
		function nullToUndefined(param) {
			if (param === null) return;
			else return param;
		}
		function isNamedParam(param) {
			return param !== void 0 && param !== null && !Array.isArray(param) && typeof param === "object";
		}
		function computeSingleParam(parameterStructures, param) {
			switch (parameterStructures) {
				case messages_1.ParameterStructures.auto: if (isNamedParam(param)) return nullToUndefined(param);
				else return [undefinedToNull(param)];
				case messages_1.ParameterStructures.byName:
					if (!isNamedParam(param)) throw new Error(`Received parameters by name but param is not an object literal.`);
					return nullToUndefined(param);
				case messages_1.ParameterStructures.byPosition: return [undefinedToNull(param)];
				default: throw new Error(`Unknown parameter structure ${parameterStructures.toString()}`);
			}
		}
		function computeMessageParams(type, params) {
			let result;
			const numberOfParams = type.numberOfParams;
			switch (numberOfParams) {
				case 0:
					result = void 0;
					break;
				case 1:
					result = computeSingleParam(type.parameterStructures, params[0]);
					break;
				default:
					result = [];
					for (let i = 0; i < params.length && i < numberOfParams; i++) result.push(undefinedToNull(params[i]));
					if (params.length < numberOfParams) for (let i = params.length; i < numberOfParams; i++) result.push(null);
			}
			return result;
		}
		const connection = {
			sendNotification: (type, ...args) => {
				throwIfClosedOrDisposed();
				let method;
				let messageParams;
				if (Is.string(type)) {
					method = type;
					const first = args[0];
					let paramStart = 0;
					let parameterStructures = messages_1.ParameterStructures.auto;
					if (messages_1.ParameterStructures.is(first)) {
						paramStart = 1;
						parameterStructures = first;
					}
					const paramEnd = args.length;
					const numberOfParams = paramEnd - paramStart;
					switch (numberOfParams) {
						case 0:
							messageParams = void 0;
							break;
						case 1:
							messageParams = computeSingleParam(parameterStructures, args[paramStart]);
							break;
						default:
							if (parameterStructures === messages_1.ParameterStructures.byName) throw new Error(`Received ${numberOfParams} parameters for 'by Name' notification parameter structure.`);
							messageParams = args.slice(paramStart, paramEnd).map((value) => undefinedToNull(value));
					}
				} else {
					const params = args;
					method = type.method;
					messageParams = computeMessageParams(type, params);
				}
				const notificationMessage = {
					jsonrpc: version,
					method,
					params: messageParams
				};
				traceSendingNotification(notificationMessage);
				return messageWriter.write(notificationMessage).catch((error) => {
					logger.error(`Sending notification failed.`);
					throw error;
				});
			},
			onNotification: (type, handler) => {
				throwIfClosedOrDisposed();
				let method;
				if (Is.func(type)) starNotificationHandler = type;
				else if (handler) {
					if (Is.string(type)) {
						method = type;
						notificationHandlers.set(type, {
							type: void 0,
							handler
						});
					} else {
						method = type.method;
						notificationHandlers.set(type.method, {
							type,
							handler
						});
					}
				}
				return { dispose: () => {
					if (method !== void 0) {
						if (notificationHandlers.get(method)?.handler === handler) notificationHandlers.delete(method);
					} else if (starNotificationHandler === type) starNotificationHandler = void 0;
				} };
			},
			onProgress: (_type, token, handler) => {
				if (progressHandlers.has(token)) throw new Error(`Progress handler for token ${token} already registered`);
				progressHandlers.set(token, handler);
				return { dispose: () => {
					if (progressHandlers.get(token) === handler) progressHandlers.delete(token);
				} };
			},
			sendProgress: (_type, token, value) => {
				return connection.sendNotification(ProgressNotification.type, {
					token,
					value
				});
			},
			onUnhandledProgress: unhandledProgressEmitter.event,
			sendRequest: (type, ...args) => {
				throwIfClosedOrDisposed();
				throwIfNotListening();
				function sendCancellation(connection, id) {
					const p = cancellationStrategy.sender.sendCancellation(connection, id);
					if (p === void 0) logger.log(`Received no promise from cancellation strategy when cancelling id ${id}`);
					else p.catch(() => {
						logger.log(`Sending cancellation messages for id ${id} failed.`);
					});
				}
				let method;
				let messageParams;
				let token = void 0;
				if (Is.string(type)) {
					method = type;
					const first = args[0];
					const last = args[args.length - 1];
					let paramStart = 0;
					let parameterStructures = messages_1.ParameterStructures.auto;
					if (messages_1.ParameterStructures.is(first)) {
						paramStart = 1;
						parameterStructures = first;
					}
					let paramEnd = args.length;
					if (cancellation_1.CancellationToken.is(last)) {
						paramEnd = paramEnd - 1;
						token = last;
					}
					const numberOfParams = paramEnd - paramStart;
					switch (numberOfParams) {
						case 0:
							messageParams = void 0;
							break;
						case 1:
							messageParams = computeSingleParam(parameterStructures, args[paramStart]);
							break;
						default:
							if (parameterStructures === messages_1.ParameterStructures.byName) throw new Error(`Received ${numberOfParams} parameters for 'by Name' request parameter structure.`);
							messageParams = args.slice(paramStart, paramEnd).map((value) => undefinedToNull(value));
					}
				} else {
					const params = args;
					method = type.method;
					messageParams = computeMessageParams(type, params);
					const numberOfParams = type.numberOfParams;
					token = cancellation_1.CancellationToken.is(params[numberOfParams]) ? params[numberOfParams] : void 0;
				}
				const id = sequenceNumber++;
				let disposable;
				let tokenWasCancelled = false;
				if (token !== void 0) {
					if (token.isCancellationRequested) tokenWasCancelled = true;
					else disposable = token.onCancellationRequested(() => {
						sendCancellation(connection, id);
					});
				}
				const requestMessage = {
					jsonrpc: version,
					id,
					method,
					params: messageParams
				};
				traceSendingRequest(requestMessage);
				if (typeof cancellationStrategy.sender.enableCancellation === "function") cancellationStrategy.sender.enableCancellation(requestMessage);
				return new Promise(async (resolve, reject) => {
					const resolveWithCleanup = (r) => {
						resolve(r);
						cancellationStrategy.sender.cleanup(id);
						disposable?.dispose();
					};
					const rejectWithCleanup = (r) => {
						reject(r);
						cancellationStrategy.sender.cleanup(id);
						disposable?.dispose();
					};
					const responsePromise = {
						method,
						timerStart: Date.now(),
						resolve: resolveWithCleanup,
						reject: rejectWithCleanup
					};
					try {
						responsePromises.set(id, responsePromise);
						await messageWriter.write(requestMessage);
						if (tokenWasCancelled) sendCancellation(connection, id);
					} catch (error) {
						responsePromises.delete(id);
						responsePromise.reject(new messages_1.ResponseError(messages_1.ErrorCodes.MessageWriteError, error.message ? error.message : "Unknown reason"));
						logger.error(`Sending request failed.`);
					}
				});
			},
			onRequest: (type, handler) => {
				throwIfClosedOrDisposed();
				let method = null;
				if (StarRequestHandler.is(type)) {
					method = void 0;
					starRequestHandler = type;
				} else if (Is.string(type)) {
					method = null;
					if (handler !== void 0) {
						method = type;
						requestHandlers.set(type, {
							handler,
							type: void 0
						});
					}
				} else if (handler !== void 0) {
					method = type.method;
					requestHandlers.set(type.method, {
						type,
						handler
					});
				}
				return { dispose: () => {
					if (method === null) return;
					if (method !== void 0) {
						if (requestHandlers.get(method)?.handler === handler) requestHandlers.delete(method);
					} else if (starRequestHandler === type) starRequestHandler = void 0;
				} };
			},
			hasPendingResponse: () => {
				return responsePromises.size > 0;
			},
			trace: async (_value, _tracer, sendNotificationOrTraceOptions) => {
				let _sendNotification = false;
				let _traceFormat = TraceFormat.Text;
				if (sendNotificationOrTraceOptions !== void 0) {
					if (Is.boolean(sendNotificationOrTraceOptions)) _sendNotification = sendNotificationOrTraceOptions;
					else {
						_sendNotification = sendNotificationOrTraceOptions.sendNotification || false;
						_traceFormat = sendNotificationOrTraceOptions.traceFormat || TraceFormat.Text;
					}
				}
				trace = _value;
				traceFormat = _traceFormat;
				if (trace === Trace.Off) tracer = void 0;
				else tracer = _tracer;
				if (_sendNotification && !isClosed() && !isDisposed()) await connection.sendNotification(SetTraceNotification.type, { value: Trace.toString(_value) });
			},
			onError: errorEmitter.event,
			onClose: closeEmitter.event,
			onUnhandledNotification: unhandledNotificationEmitter.event,
			onDispose: disposeEmitter.event,
			end: () => {
				messageWriter.end();
			},
			dispose: () => {
				if (isDisposed()) return;
				state = ConnectionState.Disposed;
				disposeEmitter.fire(void 0);
				const error = new messages_1.ResponseError(messages_1.ErrorCodes.PendingResponseRejected, "Pending response rejected since connection got disposed");
				for (const promise of responsePromises.values()) promise.reject(error);
				responsePromises = /* @__PURE__ */ new Map();
				requestTokens = /* @__PURE__ */ new Map();
				knownCanceledRequests = /* @__PURE__ */ new Set();
				messageQueue = new linkedMap_1.LinkedMap();
				if (Is.func(messageWriter.dispose)) messageWriter.dispose();
				if (Is.func(messageReader.dispose)) messageReader.dispose();
			},
			listen: () => {
				throwIfClosedOrDisposed();
				throwIfListening();
				state = ConnectionState.Listening;
				messageReader.listen(callback);
			},
			inspect: () => {
				(0, ral_1.default)().console.log("inspect");
			}
		};
		connection.onNotification(LogTraceNotification.type, (params) => {
			if (trace === Trace.Off || !tracer) return;
			const verbose = trace === Trace.Verbose || trace === Trace.Compact;
			tracer.log(params.message, verbose ? params.verbose : void 0);
		});
		connection.onNotification(ProgressNotification.type, async (params) => {
			const handler = progressHandlers.get(params.token);
			if (handler) await handler(params.value);
			else unhandledProgressEmitter.fire(params);
		});
		return connection;
	}
}));
// ../../../../../node_modules/.bun/vscode-jsonrpc@10.0.0/node_modules/vscode-jsonrpc/lib/common/api.js
var require_api = /* @__PURE__ */ __commonJSMin(((exports, module, this$2) => {
	var __importDefault = this$2 && this$2.__importDefault || function(mod) {
		return mod && mod.__esModule ? mod : { "default": mod };
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.ProgressType = exports.ProgressToken = exports.createMessageConnection = exports.NullLogger = exports.ConnectionOptions = exports.ConnectionStrategy = exports.AbstractMessageBuffer = exports.WriteableStreamMessageWriter = exports.AbstractMessageWriter = exports.MessageWriter = exports.ReadableStreamMessageReader = exports.AbstractMessageReader = exports.MessageReader = exports.SharedArrayReceiverStrategy = exports.SharedArraySenderStrategy = exports.CancellationToken = exports.CancellationTokenSource = exports.Emitter = exports.Event = exports.Disposable = exports.LRUCache = exports.Touch = exports.LinkedMap = exports.ParameterStructures = exports.NotificationType9 = exports.NotificationType8 = exports.NotificationType7 = exports.NotificationType6 = exports.NotificationType5 = exports.NotificationType4 = exports.NotificationType3 = exports.NotificationType2 = exports.NotificationType1 = exports.NotificationType0 = exports.NotificationType = exports.ErrorCodes = exports.ResponseError = exports.RequestType9 = exports.RequestType8 = exports.RequestType7 = exports.RequestType6 = exports.RequestType5 = exports.RequestType4 = exports.RequestType3 = exports.RequestType2 = exports.RequestType1 = exports.RequestType0 = exports.RequestType = exports.Message = exports.RAL = void 0;
	exports.MessageStrategy = exports.CancellationStrategy = exports.CancellationSenderStrategy = exports.RequestCancellationReceiverStrategy = exports.IdCancellationReceiverStrategy = exports.CancellationReceiverStrategy = exports.ConnectionError = exports.ConnectionErrors = exports.LogTraceNotification = exports.SetTraceNotification = exports.TraceFormat = exports.TraceValues = exports.TraceValue = exports.Trace = void 0;
	const messages_1 = require_messages();
	Object.defineProperty(exports, "Message", {
		enumerable: true,
		get: function() {
			return messages_1.Message;
		}
	});
	Object.defineProperty(exports, "RequestType", {
		enumerable: true,
		get: function() {
			return messages_1.RequestType;
		}
	});
	Object.defineProperty(exports, "RequestType0", {
		enumerable: true,
		get: function() {
			return messages_1.RequestType0;
		}
	});
	Object.defineProperty(exports, "RequestType1", {
		enumerable: true,
		get: function() {
			return messages_1.RequestType1;
		}
	});
	Object.defineProperty(exports, "RequestType2", {
		enumerable: true,
		get: function() {
			return messages_1.RequestType2;
		}
	});
	Object.defineProperty(exports, "RequestType3", {
		enumerable: true,
		get: function() {
			return messages_1.RequestType3;
		}
	});
	Object.defineProperty(exports, "RequestType4", {
		enumerable: true,
		get: function() {
			return messages_1.RequestType4;
		}
	});
	Object.defineProperty(exports, "RequestType5", {
		enumerable: true,
		get: function() {
			return messages_1.RequestType5;
		}
	});
	Object.defineProperty(exports, "RequestType6", {
		enumerable: true,
		get: function() {
			return messages_1.RequestType6;
		}
	});
	Object.defineProperty(exports, "RequestType7", {
		enumerable: true,
		get: function() {
			return messages_1.RequestType7;
		}
	});
	Object.defineProperty(exports, "RequestType8", {
		enumerable: true,
		get: function() {
			return messages_1.RequestType8;
		}
	});
	Object.defineProperty(exports, "RequestType9", {
		enumerable: true,
		get: function() {
			return messages_1.RequestType9;
		}
	});
	Object.defineProperty(exports, "ResponseError", {
		enumerable: true,
		get: function() {
			return messages_1.ResponseError;
		}
	});
	Object.defineProperty(exports, "ErrorCodes", {
		enumerable: true,
		get: function() {
			return messages_1.ErrorCodes;
		}
	});
	Object.defineProperty(exports, "NotificationType", {
		enumerable: true,
		get: function() {
			return messages_1.NotificationType;
		}
	});
	Object.defineProperty(exports, "NotificationType0", {
		enumerable: true,
		get: function() {
			return messages_1.NotificationType0;
		}
	});
	Object.defineProperty(exports, "NotificationType1", {
		enumerable: true,
		get: function() {
			return messages_1.NotificationType1;
		}
	});
	Object.defineProperty(exports, "NotificationType2", {
		enumerable: true,
		get: function() {
			return messages_1.NotificationType2;
		}
	});
	Object.defineProperty(exports, "NotificationType3", {
		enumerable: true,
		get: function() {
			return messages_1.NotificationType3;
		}
	});
	Object.defineProperty(exports, "NotificationType4", {
		enumerable: true,
		get: function() {
			return messages_1.NotificationType4;
		}
	});
	Object.defineProperty(exports, "NotificationType5", {
		enumerable: true,
		get: function() {
			return messages_1.NotificationType5;
		}
	});
	Object.defineProperty(exports, "NotificationType6", {
		enumerable: true,
		get: function() {
			return messages_1.NotificationType6;
		}
	});
	Object.defineProperty(exports, "NotificationType7", {
		enumerable: true,
		get: function() {
			return messages_1.NotificationType7;
		}
	});
	Object.defineProperty(exports, "NotificationType8", {
		enumerable: true,
		get: function() {
			return messages_1.NotificationType8;
		}
	});
	Object.defineProperty(exports, "NotificationType9", {
		enumerable: true,
		get: function() {
			return messages_1.NotificationType9;
		}
	});
	Object.defineProperty(exports, "ParameterStructures", {
		enumerable: true,
		get: function() {
			return messages_1.ParameterStructures;
		}
	});
	const linkedMap_1 = require_linkedMap();
	Object.defineProperty(exports, "LinkedMap", {
		enumerable: true,
		get: function() {
			return linkedMap_1.LinkedMap;
		}
	});
	Object.defineProperty(exports, "LRUCache", {
		enumerable: true,
		get: function() {
			return linkedMap_1.LRUCache;
		}
	});
	Object.defineProperty(exports, "Touch", {
		enumerable: true,
		get: function() {
			return linkedMap_1.Touch;
		}
	});
	const disposable_1 = require_disposable();
	Object.defineProperty(exports, "Disposable", {
		enumerable: true,
		get: function() {
			return disposable_1.Disposable;
		}
	});
	const events_1 = require_events();
	Object.defineProperty(exports, "Event", {
		enumerable: true,
		get: function() {
			return events_1.Event;
		}
	});
	Object.defineProperty(exports, "Emitter", {
		enumerable: true,
		get: function() {
			return events_1.Emitter;
		}
	});
	const cancellation_1 = require_cancellation();
	Object.defineProperty(exports, "CancellationTokenSource", {
		enumerable: true,
		get: function() {
			return cancellation_1.CancellationTokenSource;
		}
	});
	Object.defineProperty(exports, "CancellationToken", {
		enumerable: true,
		get: function() {
			return cancellation_1.CancellationToken;
		}
	});
	const sharedArrayCancellation_1 = require_sharedArrayCancellation();
	Object.defineProperty(exports, "SharedArraySenderStrategy", {
		enumerable: true,
		get: function() {
			return sharedArrayCancellation_1.SharedArraySenderStrategy;
		}
	});
	Object.defineProperty(exports, "SharedArrayReceiverStrategy", {
		enumerable: true,
		get: function() {
			return sharedArrayCancellation_1.SharedArrayReceiverStrategy;
		}
	});
	const messageReader_1 = require_messageReader();
	Object.defineProperty(exports, "MessageReader", {
		enumerable: true,
		get: function() {
			return messageReader_1.MessageReader;
		}
	});
	Object.defineProperty(exports, "AbstractMessageReader", {
		enumerable: true,
		get: function() {
			return messageReader_1.AbstractMessageReader;
		}
	});
	Object.defineProperty(exports, "ReadableStreamMessageReader", {
		enumerable: true,
		get: function() {
			return messageReader_1.ReadableStreamMessageReader;
		}
	});
	const messageWriter_1 = require_messageWriter();
	Object.defineProperty(exports, "MessageWriter", {
		enumerable: true,
		get: function() {
			return messageWriter_1.MessageWriter;
		}
	});
	Object.defineProperty(exports, "AbstractMessageWriter", {
		enumerable: true,
		get: function() {
			return messageWriter_1.AbstractMessageWriter;
		}
	});
	Object.defineProperty(exports, "WriteableStreamMessageWriter", {
		enumerable: true,
		get: function() {
			return messageWriter_1.WriteableStreamMessageWriter;
		}
	});
	const messageBuffer_1 = require_messageBuffer();
	Object.defineProperty(exports, "AbstractMessageBuffer", {
		enumerable: true,
		get: function() {
			return messageBuffer_1.AbstractMessageBuffer;
		}
	});
	const connection_1 = require_connection();
	Object.defineProperty(exports, "ConnectionStrategy", {
		enumerable: true,
		get: function() {
			return connection_1.ConnectionStrategy;
		}
	});
	Object.defineProperty(exports, "ConnectionOptions", {
		enumerable: true,
		get: function() {
			return connection_1.ConnectionOptions;
		}
	});
	Object.defineProperty(exports, "NullLogger", {
		enumerable: true,
		get: function() {
			return connection_1.NullLogger;
		}
	});
	Object.defineProperty(exports, "createMessageConnection", {
		enumerable: true,
		get: function() {
			return connection_1.createMessageConnection;
		}
	});
	Object.defineProperty(exports, "ProgressToken", {
		enumerable: true,
		get: function() {
			return connection_1.ProgressToken;
		}
	});
	Object.defineProperty(exports, "ProgressType", {
		enumerable: true,
		get: function() {
			return connection_1.ProgressType;
		}
	});
	Object.defineProperty(exports, "Trace", {
		enumerable: true,
		get: function() {
			return connection_1.Trace;
		}
	});
	Object.defineProperty(exports, "TraceValue", {
		enumerable: true,
		get: function() {
			return connection_1.TraceValue;
		}
	});
	Object.defineProperty(exports, "TraceFormat", {
		enumerable: true,
		get: function() {
			return connection_1.TraceFormat;
		}
	});
	Object.defineProperty(exports, "SetTraceNotification", {
		enumerable: true,
		get: function() {
			return connection_1.SetTraceNotification;
		}
	});
	Object.defineProperty(exports, "LogTraceNotification", {
		enumerable: true,
		get: function() {
			return connection_1.LogTraceNotification;
		}
	});
	Object.defineProperty(exports, "ConnectionErrors", {
		enumerable: true,
		get: function() {
			return connection_1.ConnectionErrors;
		}
	});
	Object.defineProperty(exports, "ConnectionError", {
		enumerable: true,
		get: function() {
			return connection_1.ConnectionError;
		}
	});
	Object.defineProperty(exports, "CancellationReceiverStrategy", {
		enumerable: true,
		get: function() {
			return connection_1.CancellationReceiverStrategy;
		}
	});
	Object.defineProperty(exports, "IdCancellationReceiverStrategy", {
		enumerable: true,
		get: function() {
			return connection_1.IdCancellationReceiverStrategy;
		}
	});
	Object.defineProperty(exports, "RequestCancellationReceiverStrategy", {
		enumerable: true,
		get: function() {
			return connection_1.RequestCancellationReceiverStrategy;
		}
	});
	Object.defineProperty(exports, "CancellationSenderStrategy", {
		enumerable: true,
		get: function() {
			return connection_1.CancellationSenderStrategy;
		}
	});
	Object.defineProperty(exports, "CancellationStrategy", {
		enumerable: true,
		get: function() {
			return connection_1.CancellationStrategy;
		}
	});
	Object.defineProperty(exports, "MessageStrategy", {
		enumerable: true,
		get: function() {
			return connection_1.MessageStrategy;
		}
	});
	Object.defineProperty(exports, "TraceValues", {
		enumerable: true,
		get: function() {
			return connection_1.TraceValues;
		}
	});
	exports.RAL = __importDefault(require_ral()).default;
}));
// ../../../../../node_modules/.bun/vscode-jsonrpc@10.0.0/node_modules/vscode-jsonrpc/lib/node/ril.js
var require_ril = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const util_1 = require("util");
	const crypto_1 = require("crypto");
	const api_1 = require_api();
	var MessageBuffer = class MessageBuffer extends api_1.AbstractMessageBuffer {
		static emptyBuffer = Buffer.allocUnsafe(0);
		constructor(encoding = "utf-8") {
			super(encoding);
		}
		emptyBuffer() {
			return MessageBuffer.emptyBuffer;
		}
		fromString(value, encoding) {
			return Buffer.from(value, encoding);
		}
		toString(value, encoding) {
			if (value instanceof Buffer) return value.toString(encoding);
			else return new util_1.TextDecoder(encoding).decode(value);
		}
		asNative(buffer, length) {
			if (length === void 0) return buffer instanceof Buffer ? buffer : Buffer.from(buffer);
			else return buffer instanceof Buffer ? buffer.slice(0, length) : Buffer.from(buffer.subarray(0, length));
		}
		allocNative(length) {
			return Buffer.allocUnsafe(length);
		}
	};
	var ReadableStreamWrapper = class {
		stream;
		constructor(stream) {
			this.stream = stream;
		}
		onClose(listener) {
			this.stream.on("close", listener);
			return api_1.Disposable.create(() => this.stream.off("close", listener));
		}
		onError(listener) {
			this.stream.on("error", listener);
			return api_1.Disposable.create(() => this.stream.off("error", listener));
		}
		onEnd(listener) {
			this.stream.on("end", listener);
			return api_1.Disposable.create(() => this.stream.off("end", listener));
		}
		onData(listener) {
			this.stream.on("data", listener);
			return api_1.Disposable.create(() => this.stream.off("data", listener));
		}
	};
	var WritableStreamWrapper = class {
		stream;
		constructor(stream) {
			this.stream = stream;
		}
		onClose(listener) {
			this.stream.on("close", listener);
			return api_1.Disposable.create(() => this.stream.off("close", listener));
		}
		onError(listener) {
			this.stream.on("error", listener);
			return api_1.Disposable.create(() => this.stream.off("error", listener));
		}
		onEnd(listener) {
			this.stream.on("end", listener);
			return api_1.Disposable.create(() => this.stream.off("end", listener));
		}
		write(data, encoding) {
			return new Promise((resolve, reject) => {
				const callback = (error) => {
					if (error === void 0 || error === null) resolve();
					else reject(error);
				};
				if (typeof data === "string") this.stream.write(data, encoding, callback);
				else this.stream.write(data, callback);
			});
		}
		end() {
			this.stream.end();
		}
	};
	const _ril = Object.freeze({
		crypto: Object.freeze({ randomUUID: () => (0, crypto_1.randomUUID)() }),
		messageBuffer: Object.freeze({ create: (encoding) => new MessageBuffer(encoding) }),
		applicationJson: Object.freeze({
			encoder: Object.freeze({
				name: "application/json",
				encode: (msg, options) => {
					try {
						return Promise.resolve(Buffer.from(JSON.stringify(msg, void 0, 0), options.charset));
					} catch (err) {
						return Promise.reject(err);
					}
				}
			}),
			decoder: Object.freeze({
				name: "application/json",
				decode: (buffer, options) => {
					try {
						if (buffer instanceof Buffer) return Promise.resolve(JSON.parse(buffer.toString(options.charset)));
						else return Promise.resolve(JSON.parse(new util_1.TextDecoder(options.charset).decode(buffer)));
					} catch (err) {
						return Promise.reject(err);
					}
				}
			})
		}),
		stream: Object.freeze({
			asReadableStream: (stream) => new ReadableStreamWrapper(stream),
			asWritableStream: (stream) => new WritableStreamWrapper(stream)
		}),
		console,
		timer: Object.freeze({
			setTimeout(callback, ms, ...args) {
				const handle = setTimeout(callback, ms, ...args);
				return { dispose: () => clearTimeout(handle) };
			},
			setImmediate(callback, ...args) {
				const handle = setImmediate(callback, ...args);
				return { dispose: () => clearImmediate(handle) };
			},
			setInterval(callback, ms, ...args) {
				const handle = setInterval(callback, ms, ...args);
				return { dispose: () => clearInterval(handle) };
			}
		})
	});
	function RIL() {
		return _ril;
	}
	(function(RIL) {
		function install() {
			api_1.RAL.install(_ril);
		}
		RIL.install = install;
	})(RIL || (RIL = {}));
	exports.default = RIL;
}));
// ../../../../com/npmjs/vscode-jsonrpc/+.ts
var import_main = (/* @__PURE__ */ __commonJSMin(((exports, module, this$1) => {
	var __createBinding = this$1 && this$1.__createBinding || (Object.create ? (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		var desc = Object.getOwnPropertyDescriptor(m, k);
		if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) desc = {
			enumerable: true,
			get: function() {
				return m[k];
			}
		};
		Object.defineProperty(o, k2, desc);
	}) : (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		o[k2] = m[k];
	}));
	var __setModuleDefault = this$1 && this$1.__setModuleDefault || (Object.create ? (function(o, v) {
		Object.defineProperty(o, "default", {
			enumerable: true,
			value: v
		});
	}) : function(o, v) {
		o["default"] = v;
	});
	var __importStar = this$1 && this$1.__importStar || (function() {
		var ownKeys = function(o) {
			ownKeys = Object.getOwnPropertyNames || function(o) {
				var ar = [];
				for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
				return ar;
			};
			return ownKeys(o);
		};
		return function(mod) {
			if (mod && mod.__esModule) return mod;
			var result = {};
			if (mod != null) {
				for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
			}
			__setModuleDefault(result, mod);
			return result;
		};
	})();
	var __exportStar = this$1 && this$1.__exportStar || function(m, exports) {
		for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
	};
	var __importDefault = this$1 && this$1.__importDefault || function(mod) {
		return mod && mod.__esModule ? mod : { "default": mod };
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.StreamMessageWriter = exports.StreamMessageReader = exports.SocketMessageWriter = exports.SocketMessageReader = exports.PortMessageWriter = exports.PortMessageReader = exports.IPCMessageWriter = exports.IPCMessageReader = void 0;
	exports.generateRandomPipeName = generateRandomPipeName;
	exports.createClientPipeTransport = createClientPipeTransport;
	exports.createServerPipeTransport = createServerPipeTransport;
	exports.createClientSocketTransport = createClientSocketTransport;
	exports.createServerSocketTransport = createServerSocketTransport;
	exports.createMessageConnection = createMessageConnection;
	const ril_1 = __importDefault(require_ril());
	ril_1.default.install();
	const path = __importStar(require("path"));
	const os = __importStar(require("os"));
	const fs = __importStar(require("fs"));
	const crypto_1 = require("crypto");
	const net_1 = require("net");
	const api_1 = require_api();
	__exportStar(require_api(), exports);
	var IPCMessageReader = class extends api_1.AbstractMessageReader {
		process;
		constructor(process) {
			super();
			this.process = process;
			const eventEmitter = this.process;
			eventEmitter.on("error", (error) => this.fireError(error));
			eventEmitter.on("close", () => this.fireClose());
		}
		listen(callback) {
			this.process.on("message", callback);
			return api_1.Disposable.create(() => this.process.off("message", callback));
		}
	};
	exports.IPCMessageReader = IPCMessageReader;
	var IPCMessageWriter = class extends api_1.AbstractMessageWriter {
		process;
		errorCount;
		constructor(process) {
			super();
			this.process = process;
			this.errorCount = 0;
			const eventEmitter = this.process;
			eventEmitter.on("error", (error) => this.fireError(error));
			eventEmitter.on("close", () => this.fireClose());
		}
		write(msg) {
			try {
				if (typeof this.process.send === "function") this.process.send(msg, void 0, void 0, (error) => {
					if (error) {
						this.errorCount++;
						this.handleError(error, msg);
					} else this.errorCount = 0;
				});
				return Promise.resolve();
			} catch (error) {
				this.handleError(error, msg);
				return Promise.reject(error);
			}
		}
		handleError(error, msg) {
			this.errorCount++;
			this.fireError(error, msg, this.errorCount);
		}
		end() {}
	};
	exports.IPCMessageWriter = IPCMessageWriter;
	var PortMessageReader = class extends api_1.AbstractMessageReader {
		onData;
		constructor(port) {
			super();
			this.onData = new api_1.Emitter();
			port.on("close", () => this.fireClose());
			port.on("error", (error) => this.fireError(error));
			port.on("message", (message) => {
				this.onData.fire(message);
			});
		}
		listen(callback) {
			return this.onData.event(callback);
		}
	};
	exports.PortMessageReader = PortMessageReader;
	var PortMessageWriter = class extends api_1.AbstractMessageWriter {
		port;
		errorCount;
		constructor(port) {
			super();
			this.port = port;
			this.errorCount = 0;
			port.on("close", () => this.fireClose());
			port.on("error", (error) => this.fireError(error));
		}
		write(msg) {
			try {
				this.port.postMessage(msg);
				return Promise.resolve();
			} catch (error) {
				this.handleError(error, msg);
				return Promise.reject(error);
			}
		}
		handleError(error, msg) {
			this.errorCount++;
			this.fireError(error, msg, this.errorCount);
		}
		end() {}
	};
	exports.PortMessageWriter = PortMessageWriter;
	var SocketMessageReader = class extends api_1.ReadableStreamMessageReader {
		constructor(socket, encoding = "utf-8") {
			super((0, ril_1.default)().stream.asReadableStream(socket), encoding);
		}
	};
	exports.SocketMessageReader = SocketMessageReader;
	var SocketMessageWriter = class extends api_1.WriteableStreamMessageWriter {
		socket;
		constructor(socket, options) {
			super((0, ril_1.default)().stream.asWritableStream(socket), options);
			this.socket = socket;
		}
		dispose() {
			super.dispose();
			this.socket.destroy();
		}
	};
	exports.SocketMessageWriter = SocketMessageWriter;
	var StreamMessageReader = class extends api_1.ReadableStreamMessageReader {
		constructor(readable, encoding) {
			super((0, ril_1.default)().stream.asReadableStream(readable), encoding);
		}
	};
	exports.StreamMessageReader = StreamMessageReader;
	var StreamMessageWriter = class extends api_1.WriteableStreamMessageWriter {
		constructor(writable, options) {
			super((0, ril_1.default)().stream.asWritableStream(writable), options);
		}
	};
	exports.StreamMessageWriter = StreamMessageWriter;
	const XDG_RUNTIME_DIR = process.env["XDG_RUNTIME_DIR"];
	const safeIpcPathLengths = /* @__PURE__ */ new Map([["linux", 107], ["darwin", 102]]);
	function generateRandomPipeName() {
		if (process.platform === "win32") return `\\\\.\\pipe\\lsp-${(0, crypto_1.randomBytes)(16).toString("hex")}-sock`;
		let randomLength = 32;
		const fixedLength = 10;
		const tmpDir = fs.realpathSync(XDG_RUNTIME_DIR ?? os.tmpdir());
		const limit = safeIpcPathLengths.get(process.platform);
		if (limit !== void 0) randomLength = Math.min(limit - tmpDir.length - fixedLength, randomLength);
		if (randomLength < 16) throw new Error(`Unable to generate a random pipe name with ${randomLength} characters.`);
		const randomSuffix = (0, crypto_1.randomBytes)(Math.floor(randomLength / 2)).toString("hex");
		return path.join(tmpDir, `lsp-${randomSuffix}.sock`);
	}
	function createClientPipeTransport(pipeName, encoding = "utf-8") {
		let connectResolve;
		const connected = new Promise((resolve, _reject) => {
			connectResolve = resolve;
		});
		return new Promise((resolve, reject) => {
			const server = (0, net_1.createServer)((socket) => {
				server.close();
				connectResolve([new SocketMessageReader(socket, encoding), new SocketMessageWriter(socket, encoding)]);
			});
			server.on("error", reject);
			server.listen(pipeName, () => {
				server.removeListener("error", reject);
				resolve({
					onConnected: () => {
						return connected;
					},
					close: () => {
						server.close();
					}
				});
			});
		});
	}
	function createServerPipeTransport(pipeName, encoding = "utf-8") {
		const socket = (0, net_1.createConnection)(pipeName);
		return [new SocketMessageReader(socket, encoding), new SocketMessageWriter(socket, encoding)];
	}
	function createClientSocketTransport(port, encoding = "utf-8") {
		let connectResolve;
		const connected = new Promise((resolve, _reject) => {
			connectResolve = resolve;
		});
		return new Promise((resolve, reject) => {
			const server = (0, net_1.createServer)((socket) => {
				server.close();
				connectResolve([new SocketMessageReader(socket, encoding), new SocketMessageWriter(socket, encoding)]);
			});
			server.on("error", reject);
			server.listen(port, "127.0.0.1", () => {
				server.removeListener("error", reject);
				const address = server.address();
				if (address === null || typeof address === "string") {
					reject(/* @__PURE__ */ new Error(`Unexpected server address: ${address}`));
					return;
				}
				const boundPort = address.port;
				resolve({
					port: () => boundPort,
					onConnected: () => {
						return connected;
					},
					close: () => {
						server.close();
					}
				});
			});
		});
	}
	function createServerSocketTransport(port, encoding = "utf-8") {
		const socket = (0, net_1.createConnection)(port, "127.0.0.1");
		return [new SocketMessageReader(socket, encoding), new SocketMessageWriter(socket, encoding)];
	}
	function isReadableStream(value) {
		const candidate = value;
		return candidate.read !== void 0 && candidate.addListener !== void 0;
	}
	function isWritableStream(value) {
		const candidate = value;
		return candidate.write !== void 0 && candidate.addListener !== void 0;
	}
	function createMessageConnection(input, output, logger, options) {
		if (!logger) logger = api_1.NullLogger;
		const reader = isReadableStream(input) ? new StreamMessageReader(input) : input;
		const writer = isWritableStream(output) ? new StreamMessageWriter(output) : output;
		if (api_1.ConnectionStrategy.is(options)) options = { connectionStrategy: options };
		return (0, api_1.createMessageConnection)(reader, writer, logger, options);
	}
})))();
// bridge.ts
/**
* The process that runs every Hermes plugin's `policy.cjs`. `_bridge.py` starts one for each Hermes
* process and talks JSON-RPC with it over stdin and stdout.
*
* Policies ran inside Hermes before, on PythonMonkey, where slow JavaScript held Python's
* interpreter lock and stopped every thread of Hermes. Here the worst a policy can do is stop this
* process, and `_bridge.py` replaces one that stops answering.
*/
const MARK = "$hermes.policy";
const load = (0, node_module.createRequire)(__filename);
const policies = /* @__PURE__ */ new Map();
const connection = (0, import_main.createMessageConnection)(new import_main.StreamMessageReader(process.stdin), new import_main.StreamMessageWriter(process.stdout));
function encode(value) {
	return JSON.stringify([value], (_, item) => {
		if (item === void 0) return null;
		if (typeof item === "number" && !Number.isFinite(item)) return {
			[MARK]: "number",
			value: String(item)
		};
		if (typeof item === "bigint") return {
			[MARK]: "integer",
			value: String(item)
		};
		if (typeof item === "string" && !item.isWellFormed()) return item.toWellFormed();
		return item;
	});
}
function revive(node, call) {
	if (node === null) return void 0;
	if (typeof node !== "object") return node;
	if (Array.isArray(node)) {
		for (let index = 0; index < node.length; index++) node[index] = revive(node[index], call);
		return node;
	}
	const item = node;
	if (item[MARK] === "number") return Number(item.value);
	if (item[MARK] === "integer") return BigInt(item.value);
	if (item[MARK] === "function") {
		const index = item.value;
		return item.sync ? (...values) => hostNow(call, index, values) : (...values) => hostLater(call, index, values);
	}
	for (const key of Object.keys(item)) item[key] = revive(item[key], call);
	return item;
}
const decode = (text, call) => revive(JSON.parse(text)[0], call);
function answer(outcome, call) {
	if (outcome.ok) return decode(outcome.text, call);
	throw new Error(outcome.message);
}
async function hostLater(call, index, values) {
	return answer(await connection.sendRequest("host", {
		call,
		index,
		text: encode(values)
	}), call);
}
const syncOut = Number(process.env.HERMES_POLICY_SYNC_OUT);
const syncIn = Number(process.env.HERMES_POLICY_SYNC_IN);
const chunk = Buffer.alloc(65536);
let unread = Buffer.alloc(0);
function readLine() {
	for (;;) {
		const end = unread.indexOf(10);
		if (end >= 0) {
			const line = unread.toString("utf8", 0, end);
			unread = unread.subarray(end + 1);
			return line;
		}
		const size = (0, node_fs.readSync)(syncIn, chunk);
		if (!size) throw new Error("Hermes closed the policy worker's pipe.");
		unread = Buffer.concat([unread, chunk.subarray(0, size)]);
	}
}
function writeLine(message) {
	const bytes = Buffer.from(JSON.stringify(message) + "\n");
	for (let sent = 0; sent < bytes.length;) sent += (0, node_fs.writeSync)(syncOut, bytes, sent);
}
function hostNow(call, index, values) {
	writeLine({
		call,
		index,
		text: encode(values)
	});
	for (;;) {
		const message = JSON.parse(readLine());
		if (message.outcome) return answer(message.outcome, call);
		writeLine({ nested: run(message.invoke, false) });
	}
}
function policy(copy, path) {
	const key = copy + "\n" + path;
	let loaded = policies.get(key);
	if (!loaded) {
		delete load.cache[load.resolve(path)];
		loaded = load(path);
		policies.set(key, loaded);
	}
	return loaded;
}
function failure(error) {
	const known = error;
	return {
		ok: false,
		name: known?.name ?? "Error",
		message: String(known?.message ?? error),
		stack: String(known?.stack ?? "")
	};
}
function start({ copy, path, call, text }) {
	const [name, values] = decode(text, call);
	const module = policy(copy, path);
	if (typeof module[name] !== "function") throw new TypeError("policy.cjs exports no function named " + name);
	return module[name](...values);
}
const thenable = (value) => value !== null && typeof value === "object" && typeof value.then === "function";
function run(invoke, mayWait) {
	try {
		const result = start(invoke);
		if (!thenable(result)) return {
			ok: true,
			text: encode(result)
		};
		if (!mayWait) throw new Error("call() cannot wait for an asynchronous policy function inside a Python function that JavaScript is waiting for. Use acall().");
		return Promise.resolve(result).then((value) => ({
			ok: true,
			text: encode(value),
			waited: true
		}), failure);
	} catch (error) {
		return failure(error);
	}
}
connection.onRequest("invoke", (invoke) => run(invoke, true));
connection.onRequest("ping", () => "pong");
connection.onClose(() => process.exit(0));
process.on("unhandledRejection", (reason) => {
	process.stderr.write("unhandled rejection: " + String(reason?.stack ?? reason) + "\n");
});
process.on("uncaughtException", (error) => {
	process.stderr.write("uncaught exception: " + String(error?.stack ?? error) + "\n");
});
new node_worker_threads.Worker("const parent = process.ppid;setInterval(() => { if (process.ppid !== parent) process.kill(process.pid, 'SIGKILL'); }, 2000);", { eval: true }).unref();
connection.listen();
