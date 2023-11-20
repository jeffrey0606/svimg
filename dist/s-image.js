(function () {
	'use strict';

	/** @returns {void} */
	function noop() {}

	function run(fn) {
		return fn();
	}

	function blank_object() {
		return Object.create(null);
	}

	/**
	 * @param {Function[]} fns
	 * @returns {void}
	 */
	function run_all(fns) {
		fns.forEach(run);
	}

	/**
	 * @param {any} thing
	 * @returns {thing is Function}
	 */
	function is_function(thing) {
		return typeof thing === 'function';
	}

	/** @returns {boolean} */
	function safe_not_equal(a, b) {
		return a != a ? b == b : a !== b || (a && typeof a === 'object') || typeof a === 'function';
	}

	let src_url_equal_anchor;

	/**
	 * @param {string} element_src
	 * @param {string} url
	 * @returns {boolean}
	 */
	function src_url_equal(element_src, url) {
		if (element_src === url) return true;
		if (!src_url_equal_anchor) {
			src_url_equal_anchor = document.createElement('a');
		}
		// This is actually faster than doing URL(..).href
		src_url_equal_anchor.href = url;
		return element_src === src_url_equal_anchor.href;
	}

	/** @param {string} srcset */
	function split_srcset(srcset) {
		return srcset.split(',').map((src) => src.trim().split(' ').filter(Boolean));
	}

	/**
	 * @param {HTMLSourceElement | HTMLImageElement} element_srcset
	 * @param {string | undefined | null} srcset
	 * @returns {boolean}
	 */
	function srcset_url_equal(element_srcset, srcset) {
		const element_urls = split_srcset(element_srcset.srcset);
		const urls = split_srcset(srcset || '');

		return (
			urls.length === element_urls.length &&
			urls.every(
				([url, width], i) =>
					width === element_urls[i][1] &&
					// We need to test both ways because Vite will create an a full URL with
					// `new URL(asset, import.meta.url).href` for the client when `base: './'`, and the
					// relative URLs inside srcset are not automatically resolved to absolute URLs by
					// browsers (in contrast to img.src). This means both SSR and DOM code could
					// contain relative or absolute URLs.
					(src_url_equal(element_urls[i][0], url) || src_url_equal(url, element_urls[i][0]))
			)
		);
	}

	/** @returns {boolean} */
	function is_empty(obj) {
		return Object.keys(obj).length === 0;
	}

	/**
	 * @param {Node} target
	 * @param {Node} node
	 * @returns {void}
	 */
	function append(target, node) {
		target.appendChild(node);
	}

	/**
	 * @param {Node} target
	 * @param {string} style_sheet_id
	 * @param {string} styles
	 * @returns {void}
	 */
	function append_styles(target, style_sheet_id, styles) {
		const append_styles_to = get_root_for_style(target);
		if (!append_styles_to.getElementById(style_sheet_id)) {
			const style = element('style');
			style.id = style_sheet_id;
			style.textContent = styles;
			append_stylesheet(append_styles_to, style);
		}
	}

	/**
	 * @param {Node} node
	 * @returns {ShadowRoot | Document}
	 */
	function get_root_for_style(node) {
		if (!node) return document;
		const root = node.getRootNode ? node.getRootNode() : node.ownerDocument;
		if (root && /** @type {ShadowRoot} */ (root).host) {
			return /** @type {ShadowRoot} */ (root);
		}
		return node.ownerDocument;
	}

	/**
	 * @param {ShadowRoot | Document} node
	 * @param {HTMLStyleElement} style
	 * @returns {CSSStyleSheet}
	 */
	function append_stylesheet(node, style) {
		append(/** @type {Document} */ (node).head || node, style);
		return style.sheet;
	}

	/**
	 * @param {Node} target
	 * @param {Node} node
	 * @param {Node} [anchor]
	 * @returns {void}
	 */
	function insert(target, node, anchor) {
		target.insertBefore(node, anchor || null);
	}

	/**
	 * @param {Node} node
	 * @returns {void}
	 */
	function detach(node) {
		if (node.parentNode) {
			node.parentNode.removeChild(node);
		}
	}

	/**
	 * @template {keyof HTMLElementTagNameMap} K
	 * @param {K} name
	 * @returns {HTMLElementTagNameMap[K]}
	 */
	function element(name) {
		return document.createElement(name);
	}

	/**
	 * @param {string} data
	 * @returns {Text}
	 */
	function text(data) {
		return document.createTextNode(data);
	}

	/**
	 * @returns {Text} */
	function space() {
		return text(' ');
	}

	/**
	 * @returns {Text} */
	function empty() {
		return text('');
	}

	/**
	 * @param {EventTarget} node
	 * @param {string} event
	 * @param {EventListenerOrEventListenerObject} handler
	 * @param {boolean | AddEventListenerOptions | EventListenerOptions} [options]
	 * @returns {() => void}
	 */
	function listen(node, event, handler, options) {
		node.addEventListener(event, handler, options);
		return () => node.removeEventListener(event, handler, options);
	}

	/**
	 * @param {Element} node
	 * @param {string} attribute
	 * @param {string} [value]
	 * @returns {void}
	 */
	function attr(node, attribute, value) {
		if (value == null) node.removeAttribute(attribute);
		else if (node.getAttribute(attribute) !== value) node.setAttribute(attribute, value);
	}

	/**
	 * @param {Element} element
	 * @returns {ChildNode[]}
	 */
	function children(element) {
		return Array.from(element.childNodes);
	}

	/**
	 * @param {HTMLElement} element
	 * @returns {{}}
	 */
	function get_custom_elements_slots(element) {
		const result = {};
		element.childNodes.forEach(
			/** @param {Element} node */ (node) => {
				result[node.slot || 'default'] = true;
			}
		);
		return result;
	}

	/**
	 * @typedef {Node & {
	 * 	claim_order?: number;
	 * 	hydrate_init?: true;
	 * 	actual_end_child?: NodeEx;
	 * 	childNodes: NodeListOf<NodeEx>;
	 * }} NodeEx
	 */

	/** @typedef {ChildNode & NodeEx} ChildNodeEx */

	/** @typedef {NodeEx & { claim_order: number }} NodeEx2 */

	/**
	 * @typedef {ChildNodeEx[] & {
	 * 	claim_info?: {
	 * 		last_index: number;
	 * 		total_claimed: number;
	 * 	};
	 * }} ChildNodeArray
	 */

	let current_component;

	/** @returns {void} */
	function set_current_component(component) {
		current_component = component;
	}

	const dirty_components = [];
	const binding_callbacks = [];

	let render_callbacks = [];

	const flush_callbacks = [];

	const resolved_promise = /* @__PURE__ */ Promise.resolve();

	let update_scheduled = false;

	/** @returns {void} */
	function schedule_update() {
		if (!update_scheduled) {
			update_scheduled = true;
			resolved_promise.then(flush);
		}
	}

	/** @returns {void} */
	function add_render_callback(fn) {
		render_callbacks.push(fn);
	}

	// flush() calls callbacks in this order:
	// 1. All beforeUpdate callbacks, in order: parents before children
	// 2. All bind:this callbacks, in reverse order: children before parents.
	// 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
	//    for afterUpdates called during the initial onMount, which are called in
	//    reverse order: children before parents.
	// Since callbacks might update component values, which could trigger another
	// call to flush(), the following steps guard against this:
	// 1. During beforeUpdate, any updated components will be added to the
	//    dirty_components array and will cause a reentrant call to flush(). Because
	//    the flush index is kept outside the function, the reentrant call will pick
	//    up where the earlier call left off and go through all dirty components. The
	//    current_component value is saved and restored so that the reentrant call will
	//    not interfere with the "parent" flush() call.
	// 2. bind:this callbacks cannot trigger new flush() calls.
	// 3. During afterUpdate, any updated components will NOT have their afterUpdate
	//    callback called a second time; the seen_callbacks set, outside the flush()
	//    function, guarantees this behavior.
	const seen_callbacks = new Set();

	let flushidx = 0; // Do *not* move this inside the flush() function

	/** @returns {void} */
	function flush() {
		// Do not reenter flush while dirty components are updated, as this can
		// result in an infinite loop. Instead, let the inner flush handle it.
		// Reentrancy is ok afterwards for bindings etc.
		if (flushidx !== 0) {
			return;
		}
		const saved_component = current_component;
		do {
			// first, call beforeUpdate functions
			// and update components
			try {
				while (flushidx < dirty_components.length) {
					const component = dirty_components[flushidx];
					flushidx++;
					set_current_component(component);
					update(component.$$);
				}
			} catch (e) {
				// reset dirty state to not end up in a deadlocked state and then rethrow
				dirty_components.length = 0;
				flushidx = 0;
				throw e;
			}
			set_current_component(null);
			dirty_components.length = 0;
			flushidx = 0;
			while (binding_callbacks.length) binding_callbacks.pop()();
			// then, once components are updated, call
			// afterUpdate functions. This may cause
			// subsequent updates...
			for (let i = 0; i < render_callbacks.length; i += 1) {
				const callback = render_callbacks[i];
				if (!seen_callbacks.has(callback)) {
					// ...so guard against infinite loops
					seen_callbacks.add(callback);
					callback();
				}
			}
			render_callbacks.length = 0;
		} while (dirty_components.length);
		while (flush_callbacks.length) {
			flush_callbacks.pop()();
		}
		update_scheduled = false;
		seen_callbacks.clear();
		set_current_component(saved_component);
	}

	/** @returns {void} */
	function update($$) {
		if ($$.fragment !== null) {
			$$.update();
			run_all($$.before_update);
			const dirty = $$.dirty;
			$$.dirty = [-1];
			$$.fragment && $$.fragment.p($$.ctx, dirty);
			$$.after_update.forEach(add_render_callback);
		}
	}

	/**
	 * Useful for example to execute remaining `afterUpdate` callbacks before executing `destroy`.
	 * @param {Function[]} fns
	 * @returns {void}
	 */
	function flush_render_callbacks(fns) {
		const filtered = [];
		const targets = [];
		render_callbacks.forEach((c) => (fns.indexOf(c) === -1 ? filtered.push(c) : targets.push(c)));
		targets.forEach((c) => c());
		render_callbacks = filtered;
	}

	const outroing = new Set();

	/**
	 * @param {import('./private.js').Fragment} block
	 * @param {0 | 1} [local]
	 * @returns {void}
	 */
	function transition_in(block, local) {
		if (block && block.i) {
			outroing.delete(block);
			block.i(local);
		}
	}

	/** @typedef {1} INTRO */
	/** @typedef {0} OUTRO */
	/** @typedef {{ direction: 'in' | 'out' | 'both' }} TransitionOptions */
	/** @typedef {(node: Element, params: any, options: TransitionOptions) => import('../transition/public.js').TransitionConfig} TransitionFn */

	/**
	 * @typedef {Object} Outro
	 * @property {number} r
	 * @property {Function[]} c
	 * @property {Object} p
	 */

	/**
	 * @typedef {Object} PendingProgram
	 * @property {number} start
	 * @property {INTRO|OUTRO} b
	 * @property {Outro} [group]
	 */

	/**
	 * @typedef {Object} Program
	 * @property {number} a
	 * @property {INTRO|OUTRO} b
	 * @property {1|-1} d
	 * @property {number} duration
	 * @property {number} start
	 * @property {number} end
	 * @property {Outro} [group]
	 */

	/** @returns {void} */
	function mount_component(component, target, anchor) {
		const { fragment, after_update } = component.$$;
		fragment && fragment.m(target, anchor);
		// onMount happens before the initial afterUpdate
		add_render_callback(() => {
			const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
			// if the component was destroyed immediately
			// it will update the `$$.on_destroy` reference to `null`.
			// the destructured on_destroy may still reference to the old array
			if (component.$$.on_destroy) {
				component.$$.on_destroy.push(...new_on_destroy);
			} else {
				// Edge case - component was destroyed immediately,
				// most likely as a result of a binding initialising
				run_all(new_on_destroy);
			}
			component.$$.on_mount = [];
		});
		after_update.forEach(add_render_callback);
	}

	/** @returns {void} */
	function destroy_component(component, detaching) {
		const $$ = component.$$;
		if ($$.fragment !== null) {
			flush_render_callbacks($$.after_update);
			run_all($$.on_destroy);
			$$.fragment && $$.fragment.d(detaching);
			// TODO null out other refs, including component.$$ (but need to
			// preserve final state?)
			$$.on_destroy = $$.fragment = null;
			$$.ctx = [];
		}
	}

	/** @returns {void} */
	function make_dirty(component, i) {
		if (component.$$.dirty[0] === -1) {
			dirty_components.push(component);
			schedule_update();
			component.$$.dirty.fill(0);
		}
		component.$$.dirty[(i / 31) | 0] |= 1 << i % 31;
	}

	// TODO: Document the other params
	/**
	 * @param {SvelteComponent} component
	 * @param {import('./public.js').ComponentConstructorOptions} options
	 *
	 * @param {import('./utils.js')['not_equal']} not_equal Used to compare props and state values.
	 * @param {(target: Element | ShadowRoot) => void} [append_styles] Function that appends styles to the DOM when the component is first initialised.
	 * This will be the `add_css` function from the compiled component.
	 *
	 * @returns {void}
	 */
	function init(
		component,
		options,
		instance,
		create_fragment,
		not_equal,
		props,
		append_styles = null,
		dirty = [-1]
	) {
		const parent_component = current_component;
		set_current_component(component);
		/** @type {import('./private.js').T$$} */
		const $$ = (component.$$ = {
			fragment: null,
			ctx: [],
			// state
			props,
			update: noop,
			not_equal,
			bound: blank_object(),
			// lifecycle
			on_mount: [],
			on_destroy: [],
			on_disconnect: [],
			before_update: [],
			after_update: [],
			context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
			// everything else
			callbacks: blank_object(),
			dirty,
			skip_bound: false,
			root: options.target || parent_component.$$.root
		});
		append_styles && append_styles($$.root);
		let ready = false;
		$$.ctx = instance
			? instance(component, options.props || {}, (i, ret, ...rest) => {
					const value = rest.length ? rest[0] : ret;
					if ($$.ctx && not_equal($$.ctx[i], ($$.ctx[i] = value))) {
						if (!$$.skip_bound && $$.bound[i]) $$.bound[i](value);
						if (ready) make_dirty(component, i);
					}
					return ret;
			  })
			: [];
		$$.update();
		ready = true;
		run_all($$.before_update);
		// `false` as a special case of no DOM component
		$$.fragment = create_fragment ? create_fragment($$.ctx) : false;
		if (options.target) {
			if (options.hydrate) {
				// TODO: what is the correct type here?
				// @ts-expect-error
				const nodes = children(options.target);
				$$.fragment && $$.fragment.l(nodes);
				nodes.forEach(detach);
			} else {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				$$.fragment && $$.fragment.c();
			}
			if (options.intro) transition_in(component.$$.fragment);
			mount_component(component, options.target, options.anchor);
			flush();
		}
		set_current_component(parent_component);
	}

	let SvelteElement;

	if (typeof HTMLElement === 'function') {
		SvelteElement = class extends HTMLElement {
			/** The Svelte component constructor */
			$$ctor;
			/** Slots */
			$$s;
			/** The Svelte component instance */
			$$c;
			/** Whether or not the custom element is connected */
			$$cn = false;
			/** Component props data */
			$$d = {};
			/** `true` if currently in the process of reflecting component props back to attributes */
			$$r = false;
			/** @type {Record<string, CustomElementPropDefinition>} Props definition (name, reflected, type etc) */
			$$p_d = {};
			/** @type {Record<string, Function[]>} Event listeners */
			$$l = {};
			/** @type {Map<Function, Function>} Event listener unsubscribe functions */
			$$l_u = new Map();

			constructor($$componentCtor, $$slots, use_shadow_dom) {
				super();
				this.$$ctor = $$componentCtor;
				this.$$s = $$slots;
				if (use_shadow_dom) {
					this.attachShadow({ mode: 'open' });
				}
			}

			addEventListener(type, listener, options) {
				// We can't determine upfront if the event is a custom event or not, so we have to
				// listen to both. If someone uses a custom event with the same name as a regular
				// browser event, this fires twice - we can't avoid that.
				this.$$l[type] = this.$$l[type] || [];
				this.$$l[type].push(listener);
				if (this.$$c) {
					const unsub = this.$$c.$on(type, listener);
					this.$$l_u.set(listener, unsub);
				}
				super.addEventListener(type, listener, options);
			}

			removeEventListener(type, listener, options) {
				super.removeEventListener(type, listener, options);
				if (this.$$c) {
					const unsub = this.$$l_u.get(listener);
					if (unsub) {
						unsub();
						this.$$l_u.delete(listener);
					}
				}
			}

			async connectedCallback() {
				this.$$cn = true;
				if (!this.$$c) {
					// We wait one tick to let possible child slot elements be created/mounted
					await Promise.resolve();
					if (!this.$$cn) {
						return;
					}
					function create_slot(name) {
						return () => {
							let node;
							const obj = {
								c: function create() {
									node = element('slot');
									if (name !== 'default') {
										attr(node, 'name', name);
									}
								},
								/**
								 * @param {HTMLElement} target
								 * @param {HTMLElement} [anchor]
								 */
								m: function mount(target, anchor) {
									insert(target, node, anchor);
								},
								d: function destroy(detaching) {
									if (detaching) {
										detach(node);
									}
								}
							};
							return obj;
						};
					}
					const $$slots = {};
					const existing_slots = get_custom_elements_slots(this);
					for (const name of this.$$s) {
						if (name in existing_slots) {
							$$slots[name] = [create_slot(name)];
						}
					}
					for (const attribute of this.attributes) {
						// this.$$data takes precedence over this.attributes
						const name = this.$$g_p(attribute.name);
						if (!(name in this.$$d)) {
							this.$$d[name] = get_custom_element_value(name, attribute.value, this.$$p_d, 'toProp');
						}
					}
					this.$$c = new this.$$ctor({
						target: this.shadowRoot || this,
						props: {
							...this.$$d,
							$$slots,
							$$scope: {
								ctx: []
							}
						}
					});

					// Reflect component props as attributes
					const reflect_attributes = () => {
						this.$$r = true;
						for (const key in this.$$p_d) {
							this.$$d[key] = this.$$c.$$.ctx[this.$$c.$$.props[key]];
							if (this.$$p_d[key].reflect) {
								const attribute_value = get_custom_element_value(
									key,
									this.$$d[key],
									this.$$p_d,
									'toAttribute'
								);
								if (attribute_value == null) {
									this.removeAttribute(this.$$p_d[key].attribute || key);
								} else {
									this.setAttribute(this.$$p_d[key].attribute || key, attribute_value);
								}
							}
						}
						this.$$r = false;
					};
					this.$$c.$$.after_update.push(reflect_attributes);
					reflect_attributes(); // once initially because after_update is added too late for first render

					for (const type in this.$$l) {
						for (const listener of this.$$l[type]) {
							const unsub = this.$$c.$on(type, listener);
							this.$$l_u.set(listener, unsub);
						}
					}
					this.$$l = {};
				}
			}

			// We don't need this when working within Svelte code, but for compatibility of people using this outside of Svelte
			// and setting attributes through setAttribute etc, this is helpful
			attributeChangedCallback(attr, _oldValue, newValue) {
				if (this.$$r) return;
				attr = this.$$g_p(attr);
				this.$$d[attr] = get_custom_element_value(attr, newValue, this.$$p_d, 'toProp');
				this.$$c?.$set({ [attr]: this.$$d[attr] });
			}

			disconnectedCallback() {
				this.$$cn = false;
				// In a microtask, because this could be a move within the DOM
				Promise.resolve().then(() => {
					if (!this.$$cn) {
						this.$$c.$destroy();
						this.$$c = undefined;
					}
				});
			}

			$$g_p(attribute_name) {
				return (
					Object.keys(this.$$p_d).find(
						(key) =>
							this.$$p_d[key].attribute === attribute_name ||
							(!this.$$p_d[key].attribute && key.toLowerCase() === attribute_name)
					) || attribute_name
				);
			}
		};
	}

	/**
	 * @param {string} prop
	 * @param {any} value
	 * @param {Record<string, CustomElementPropDefinition>} props_definition
	 * @param {'toAttribute' | 'toProp'} [transform]
	 */
	function get_custom_element_value(prop, value, props_definition, transform) {
		const type = props_definition[prop]?.type;
		value = type === 'Boolean' && typeof value !== 'boolean' ? value != null : value;
		if (!transform || !props_definition[prop]) {
			return value;
		} else if (transform === 'toAttribute') {
			switch (type) {
				case 'Object':
				case 'Array':
					return value == null ? null : JSON.stringify(value);
				case 'Boolean':
					return value ? '' : null;
				case 'Number':
					return value == null ? null : value;
				default:
					return value;
			}
		} else {
			switch (type) {
				case 'Object':
				case 'Array':
					return value && JSON.parse(value);
				case 'Boolean':
					return value; // conversion already handled above
				case 'Number':
					return value != null ? +value : value;
				default:
					return value;
			}
		}
	}

	/**
	 * @internal
	 *
	 * Turn a Svelte component into a custom element.
	 * @param {import('./public.js').ComponentType} Component  A Svelte component constructor
	 * @param {Record<string, CustomElementPropDefinition>} props_definition  The props to observe
	 * @param {string[]} slots  The slots to create
	 * @param {string[]} accessors  Other accessors besides the ones for props the component has
	 * @param {boolean} use_shadow_dom  Whether to use shadow DOM
	 * @param {(ce: new () => HTMLElement) => new () => HTMLElement} [extend]
	 */
	function create_custom_element(
		Component,
		props_definition,
		slots,
		accessors,
		use_shadow_dom,
		extend
	) {
		let Class = class extends SvelteElement {
			constructor() {
				super(Component, slots, use_shadow_dom);
				this.$$p_d = props_definition;
			}
			static get observedAttributes() {
				return Object.keys(props_definition).map((key) =>
					(props_definition[key].attribute || key).toLowerCase()
				);
			}
		};
		Object.keys(props_definition).forEach((prop) => {
			Object.defineProperty(Class.prototype, prop, {
				get() {
					return this.$$c && prop in this.$$c ? this.$$c[prop] : this.$$d[prop];
				},
				set(value) {
					value = get_custom_element_value(prop, value, props_definition);
					this.$$d[prop] = value;
					this.$$c?.$set({ [prop]: value });
				}
			});
		});
		accessors.forEach((accessor) => {
			Object.defineProperty(Class.prototype, accessor, {
				get() {
					return this.$$c?.[accessor];
				}
			});
		});
		if (extend) {
			// @ts-expect-error - assigning here is fine
			Class = extend(Class);
		}
		Component.element = /** @type {any} */ (Class);
		return Class;
	}

	/**
	 * Base class for Svelte components. Used when dev=false.
	 *
	 * @template {Record<string, any>} [Props=any]
	 * @template {Record<string, any>} [Events=any]
	 */
	class SvelteComponent {
		/**
		 * ### PRIVATE API
		 *
		 * Do not use, may change at any time
		 *
		 * @type {any}
		 */
		$$ = undefined;
		/**
		 * ### PRIVATE API
		 *
		 * Do not use, may change at any time
		 *
		 * @type {any}
		 */
		$$set = undefined;

		/** @returns {void} */
		$destroy() {
			destroy_component(this, 1);
			this.$destroy = noop;
		}

		/**
		 * @template {Extract<keyof Events, string>} K
		 * @param {K} type
		 * @param {((e: Events[K]) => void) | null | undefined} callback
		 * @returns {() => void}
		 */
		$on(type, callback) {
			if (!is_function(callback)) {
				return noop;
			}
			const callbacks = this.$$.callbacks[type] || (this.$$.callbacks[type] = []);
			callbacks.push(callback);
			return () => {
				const index = callbacks.indexOf(callback);
				if (index !== -1) callbacks.splice(index, 1);
			};
		}

		/**
		 * @param {Partial<Props>} props
		 * @returns {void}
		 */
		$set(props) {
			if (this.$$set && !is_empty(props)) {
				this.$$.skip_bound = true;
				this.$$set(props);
				this.$$.skip_bound = false;
			}
		}
	}

	/**
	 * @typedef {Object} CustomElementPropDefinition
	 * @property {string} [attribute]
	 * @property {boolean} [reflect]
	 * @property {'String'|'Boolean'|'Number'|'Array'|'Object'} [type]
	 */

	// generated during release, do not modify

	const PUBLIC_VERSION = '4';

	if (typeof window !== 'undefined')
		// @ts-ignore
		(window.__svelte || (window.__svelte = { v: new Set() })).v.add(PUBLIC_VERSION);

	/* src/Image.svelte generated by Svelte v4.2.6 */

	function add_css(target) {
		append_styles(target, "svelte-c3zwza", ".wrapper.svelte-c3zwza.svelte-c3zwza{display:grid;grid:1fr / 1fr;gap:0px;grid-gap:0px;overflow:hidden}.wrapper.svelte-c3zwza>.svelte-c3zwza{grid-area:1 / 1 / 2 / 2}.wrapper.svelte-c3zwza img.svelte-c3zwza{width:100%;height:100%;display:block;aspect-ratio:var(--svimg-aspect-ratio)}.image.svelte-c3zwza.svelte-c3zwza{opacity:0;transition:opacity 0.25s ease-in}.image.loaded.svelte-c3zwza.svelte-c3zwza{opacity:1}.placeholder.svelte-c3zwza.svelte-c3zwza{z-index:-1;filter:blur(var(--svimg-blur))}");
	}

	// (147:4) {#if srcsetavif}
	function create_if_block_5(ctx) {
		let source;
		let source_srcset_value;

		return {
			c() {
				source = element("source");
				attr(source, "type", "image/avif");

				if (!srcset_url_equal(source, source_srcset_value = /*setSrcset*/ ctx[23]
				? /*srcsetavif*/ ctx[5]
				: undefined)) attr(source, "srcset", source_srcset_value);

				attr(source, "sizes", /*sizes*/ ctx[16]);
			},
			m(target, anchor) {
				insert(target, source, anchor);
			},
			p(ctx, dirty) {
				if (dirty[0] & /*setSrcset, srcsetavif*/ 8388640 && source_srcset_value !== (source_srcset_value = /*setSrcset*/ ctx[23]
				? /*srcsetavif*/ ctx[5]
				: undefined)) {
					attr(source, "srcset", source_srcset_value);
				}

				if (dirty[0] & /*sizes*/ 65536) {
					attr(source, "sizes", /*sizes*/ ctx[16]);
				}
			},
			d(detaching) {
				if (detaching) {
					detach(source);
				}
			}
		};
	}

	// (154:4) {#if srcsetwebp}
	function create_if_block_4(ctx) {
		let source;
		let source_srcset_value;

		return {
			c() {
				source = element("source");
				attr(source, "type", "image/webp");

				if (!srcset_url_equal(source, source_srcset_value = /*setSrcset*/ ctx[23]
				? /*srcsetwebp*/ ctx[4]
				: undefined)) attr(source, "srcset", source_srcset_value);

				attr(source, "sizes", /*sizes*/ ctx[16]);
			},
			m(target, anchor) {
				insert(target, source, anchor);
			},
			p(ctx, dirty) {
				if (dirty[0] & /*setSrcset, srcsetwebp*/ 8388624 && source_srcset_value !== (source_srcset_value = /*setSrcset*/ ctx[23]
				? /*srcsetwebp*/ ctx[4]
				: undefined)) {
					attr(source, "srcset", source_srcset_value);
				}

				if (dirty[0] & /*sizes*/ 65536) {
					attr(source, "sizes", /*sizes*/ ctx[16]);
				}
			},
			d(detaching) {
				if (detaching) {
					detach(source);
				}
			}
		};
	}

	// (179:2) {#if !immediate && !hidePlaceholder}
	function create_if_block(ctx) {
		let if_block_anchor;

		function select_block_type(ctx, dirty) {
			if (/*placeholdersrc*/ ctx[7]) return create_if_block_1;
			return create_else_block;
		}

		let current_block_type = select_block_type(ctx);
		let if_block = current_block_type(ctx);

		return {
			c() {
				if_block.c();
				if_block_anchor = empty();
			},
			m(target, anchor) {
				if_block.m(target, anchor);
				insert(target, if_block_anchor, anchor);
			},
			p(ctx, dirty) {
				if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
					if_block.p(ctx, dirty);
				} else {
					if_block.d(1);
					if_block = current_block_type(ctx);

					if (if_block) {
						if_block.c();
						if_block.m(if_block_anchor.parentNode, if_block_anchor);
					}
				}
			},
			d(detaching) {
				if (detaching) {
					detach(if_block_anchor);
				}

				if_block.d(detaching);
			}
		};
	}

	// (199:4) {:else}
	function create_else_block(ctx) {
		let img;
		let img_src_value;
		let img_style_value;

		return {
			c() {
				img = element("img");
				attr(img, "class", "placeholder svelte-c3zwza");
				if (!src_url_equal(img.src, img_src_value = /*placeholder*/ ctx[6])) attr(img, "src", img_src_value);
				attr(img, "alt", /*alt*/ ctx[0]);
				attr(img, "width", /*imageWidth*/ ctx[17]);
				attr(img, "height", /*imageHeight*/ ctx[24]);

				attr(img, "style", img_style_value = /*useAspectRatioFallback*/ ctx[22]
				? `width:${/*imageWidth*/ ctx[17]}px; height:${/*imageHeight*/ ctx[24]}px;`
				: "");
			},
			m(target, anchor) {
				insert(target, img, anchor);
			},
			p(ctx, dirty) {
				if (dirty[0] & /*placeholder*/ 64 && !src_url_equal(img.src, img_src_value = /*placeholder*/ ctx[6])) {
					attr(img, "src", img_src_value);
				}

				if (dirty[0] & /*alt*/ 1) {
					attr(img, "alt", /*alt*/ ctx[0]);
				}

				if (dirty[0] & /*imageWidth*/ 131072) {
					attr(img, "width", /*imageWidth*/ ctx[17]);
				}

				if (dirty[0] & /*imageHeight*/ 16777216) {
					attr(img, "height", /*imageHeight*/ ctx[24]);
				}

				if (dirty[0] & /*useAspectRatioFallback, imageWidth, imageHeight*/ 21102592 && img_style_value !== (img_style_value = /*useAspectRatioFallback*/ ctx[22]
				? `width:${/*imageWidth*/ ctx[17]}px; height:${/*imageHeight*/ ctx[24]}px;`
				: "")) {
					attr(img, "style", img_style_value);
				}
			},
			d(detaching) {
				if (detaching) {
					detach(img);
				}
			}
		};
	}

	// (180:4) {#if placeholdersrc}
	function create_if_block_1(ctx) {
		let picture;
		let t0;
		let t1;
		let img;
		let img_srcset_value;
		let img_style_value;
		let if_block0 = /*placeholderavif*/ ctx[9] && create_if_block_3(ctx);
		let if_block1 = /*placeholderwebp*/ ctx[8] && create_if_block_2(ctx);

		return {
			c() {
				picture = element("picture");
				if (if_block0) if_block0.c();
				t0 = space();
				if (if_block1) if_block1.c();
				t1 = space();
				img = element("img");
				attr(img, "class", "placeholder svelte-c3zwza");
				if (!srcset_url_equal(img, img_srcset_value = /*placeholdersrc*/ ctx[7])) attr(img, "srcset", img_srcset_value);
				attr(img, "alt", /*alt*/ ctx[0]);
				attr(img, "width", /*imageWidth*/ ctx[17]);
				attr(img, "height", /*imageHeight*/ ctx[24]);

				attr(img, "style", img_style_value = /*useAspectRatioFallback*/ ctx[22]
				? `width:${/*imageWidth*/ ctx[17]}px; height:${/*imageHeight*/ ctx[24]}px;`
				: "");

				attr(picture, "class", "svelte-c3zwza");
			},
			m(target, anchor) {
				insert(target, picture, anchor);
				if (if_block0) if_block0.m(picture, null);
				append(picture, t0);
				if (if_block1) if_block1.m(picture, null);
				append(picture, t1);
				append(picture, img);
			},
			p(ctx, dirty) {
				if (/*placeholderavif*/ ctx[9]) {
					if (if_block0) {
						if_block0.p(ctx, dirty);
					} else {
						if_block0 = create_if_block_3(ctx);
						if_block0.c();
						if_block0.m(picture, t0);
					}
				} else if (if_block0) {
					if_block0.d(1);
					if_block0 = null;
				}

				if (/*placeholderwebp*/ ctx[8]) {
					if (if_block1) {
						if_block1.p(ctx, dirty);
					} else {
						if_block1 = create_if_block_2(ctx);
						if_block1.c();
						if_block1.m(picture, t1);
					}
				} else if (if_block1) {
					if_block1.d(1);
					if_block1 = null;
				}

				if (dirty[0] & /*placeholdersrc*/ 128 && img_srcset_value !== (img_srcset_value = /*placeholdersrc*/ ctx[7])) {
					attr(img, "srcset", img_srcset_value);
				}

				if (dirty[0] & /*alt*/ 1) {
					attr(img, "alt", /*alt*/ ctx[0]);
				}

				if (dirty[0] & /*imageWidth*/ 131072) {
					attr(img, "width", /*imageWidth*/ ctx[17]);
				}

				if (dirty[0] & /*imageHeight*/ 16777216) {
					attr(img, "height", /*imageHeight*/ ctx[24]);
				}

				if (dirty[0] & /*useAspectRatioFallback, imageWidth, imageHeight*/ 21102592 && img_style_value !== (img_style_value = /*useAspectRatioFallback*/ ctx[22]
				? `width:${/*imageWidth*/ ctx[17]}px; height:${/*imageHeight*/ ctx[24]}px;`
				: "")) {
					attr(img, "style", img_style_value);
				}
			},
			d(detaching) {
				if (detaching) {
					detach(picture);
				}

				if (if_block0) if_block0.d();
				if (if_block1) if_block1.d();
			}
		};
	}

	// (182:8) {#if placeholderavif}
	function create_if_block_3(ctx) {
		let source;
		let source_srcset_value;

		return {
			c() {
				source = element("source");
				attr(source, "type", "image/avif");
				if (!srcset_url_equal(source, source_srcset_value = /*placeholderavif*/ ctx[9])) attr(source, "srcset", source_srcset_value);
			},
			m(target, anchor) {
				insert(target, source, anchor);
			},
			p(ctx, dirty) {
				if (dirty[0] & /*placeholderavif*/ 512 && source_srcset_value !== (source_srcset_value = /*placeholderavif*/ ctx[9])) {
					attr(source, "srcset", source_srcset_value);
				}
			},
			d(detaching) {
				if (detaching) {
					detach(source);
				}
			}
		};
	}

	// (185:8) {#if placeholderwebp}
	function create_if_block_2(ctx) {
		let source;
		let source_srcset_value;

		return {
			c() {
				source = element("source");
				attr(source, "type", "image/webp");
				if (!srcset_url_equal(source, source_srcset_value = /*placeholderwebp*/ ctx[8])) attr(source, "srcset", source_srcset_value);
			},
			m(target, anchor) {
				insert(target, source, anchor);
			},
			p(ctx, dirty) {
				if (dirty[0] & /*placeholderwebp*/ 256 && source_srcset_value !== (source_srcset_value = /*placeholderwebp*/ ctx[8])) {
					attr(source, "srcset", source_srcset_value);
				}
			},
			d(detaching) {
				if (detaching) {
					detach(source);
				}
			}
		};
	}

	function create_fragment(ctx) {
		let div;
		let picture;
		let t0;
		let t1;
		let img;
		let img_srcset_value;
		let img_alt_value;
		let img_loading_value;
		let img_class_value;
		let t2;
		let div_style_value;
		let div_class_value;
		let mounted;
		let dispose;
		let if_block0 = /*srcsetavif*/ ctx[5] && create_if_block_5(ctx);
		let if_block1 = /*srcsetwebp*/ ctx[4] && create_if_block_4(ctx);
		let if_block2 = !/*immediate*/ ctx[12] && !/*hidePlaceholder*/ ctx[21] && create_if_block(ctx);

		return {
			c() {
				div = element("div");
				picture = element("picture");
				if (if_block0) if_block0.c();
				t0 = space();
				if (if_block1) if_block1.c();
				t1 = space();
				img = element("img");
				t2 = space();
				if (if_block2) if_block2.c();
				if (!srcset_url_equal(img, img_srcset_value = /*setSrcset*/ ctx[23] ? /*srcset*/ ctx[3] : undefined)) attr(img, "srcset", img_srcset_value);
				attr(img, "sizes", /*sizes*/ ctx[16]);

				attr(img, "alt", img_alt_value = /*imgLoaded*/ ctx[19] || /*imgError*/ ctx[20]
				? /*alt*/ ctx[0]
				: undefined);

				attr(img, "width", /*imageWidth*/ ctx[17]);
				attr(img, "height", /*imageHeight*/ ctx[24]);
				attr(img, "loading", img_loading_value = !/*immediate*/ ctx[12] ? "lazy" : undefined);

				attr(img, "class", img_class_value = "image " + /*className*/ ctx[1] + " " + (/*imgLoaded*/ ctx[19] || /*immediate*/ ctx[12]
				? 'loaded'
				: '') + " svelte-c3zwza");

				attr(img, "style", /*styleName*/ ctx[2]);
				attr(picture, "class", "svelte-c3zwza");

				attr(div, "style", div_style_value = "" + ((/*fixedWidth*/ ctx[15]
				? `max-width:${/*width*/ ctx[10]}px;`
				: '') + " --svimg-blur:" + /*blur*/ ctx[13] + "px; " + (/*aspectratio*/ ctx[11]
				? `--svimg-aspect-ratio:${/*aspectratio*/ ctx[11]};`
				: '') + " ; " + /*styleName*/ ctx[2]));

				attr(div, "class", div_class_value = "wrapper " + /*className*/ ctx[1] + " svelte-c3zwza");
			},
			m(target, anchor) {
				insert(target, div, anchor);
				append(div, picture);
				if (if_block0) if_block0.m(picture, null);
				append(picture, t0);
				if (if_block1) if_block1.m(picture, null);
				append(picture, t1);
				append(picture, img);
				append(div, t2);
				if (if_block2) if_block2.m(div, null);
				/*div_binding*/ ctx[36](div);

				if (!mounted) {
					dispose = [
						listen(img, "load", /*onImgLoad*/ ctx[25]),
						listen(img, "error", /*error_handler*/ ctx[35])
					];

					mounted = true;
				}
			},
			p(ctx, dirty) {
				if (/*srcsetavif*/ ctx[5]) {
					if (if_block0) {
						if_block0.p(ctx, dirty);
					} else {
						if_block0 = create_if_block_5(ctx);
						if_block0.c();
						if_block0.m(picture, t0);
					}
				} else if (if_block0) {
					if_block0.d(1);
					if_block0 = null;
				}

				if (/*srcsetwebp*/ ctx[4]) {
					if (if_block1) {
						if_block1.p(ctx, dirty);
					} else {
						if_block1 = create_if_block_4(ctx);
						if_block1.c();
						if_block1.m(picture, t1);
					}
				} else if (if_block1) {
					if_block1.d(1);
					if_block1 = null;
				}

				if (dirty[0] & /*setSrcset, srcset*/ 8388616 && img_srcset_value !== (img_srcset_value = /*setSrcset*/ ctx[23] ? /*srcset*/ ctx[3] : undefined)) {
					attr(img, "srcset", img_srcset_value);
				}

				if (dirty[0] & /*sizes*/ 65536) {
					attr(img, "sizes", /*sizes*/ ctx[16]);
				}

				if (dirty[0] & /*imgLoaded, imgError, alt*/ 1572865 && img_alt_value !== (img_alt_value = /*imgLoaded*/ ctx[19] || /*imgError*/ ctx[20]
				? /*alt*/ ctx[0]
				: undefined)) {
					attr(img, "alt", img_alt_value);
				}

				if (dirty[0] & /*imageWidth*/ 131072) {
					attr(img, "width", /*imageWidth*/ ctx[17]);
				}

				if (dirty[0] & /*imageHeight*/ 16777216) {
					attr(img, "height", /*imageHeight*/ ctx[24]);
				}

				if (dirty[0] & /*immediate*/ 4096 && img_loading_value !== (img_loading_value = !/*immediate*/ ctx[12] ? "lazy" : undefined)) {
					attr(img, "loading", img_loading_value);
				}

				if (dirty[0] & /*className, imgLoaded, immediate*/ 528386 && img_class_value !== (img_class_value = "image " + /*className*/ ctx[1] + " " + (/*imgLoaded*/ ctx[19] || /*immediate*/ ctx[12]
				? 'loaded'
				: '') + " svelte-c3zwza")) {
					attr(img, "class", img_class_value);
				}

				if (dirty[0] & /*styleName*/ 4) {
					attr(img, "style", /*styleName*/ ctx[2]);
				}

				if (!/*immediate*/ ctx[12] && !/*hidePlaceholder*/ ctx[21]) {
					if (if_block2) {
						if_block2.p(ctx, dirty);
					} else {
						if_block2 = create_if_block(ctx);
						if_block2.c();
						if_block2.m(div, null);
					}
				} else if (if_block2) {
					if_block2.d(1);
					if_block2 = null;
				}

				if (dirty[0] & /*fixedWidth, width, blur, aspectratio, styleName*/ 44036 && div_style_value !== (div_style_value = "" + ((/*fixedWidth*/ ctx[15]
				? `max-width:${/*width*/ ctx[10]}px;`
				: '') + " --svimg-blur:" + /*blur*/ ctx[13] + "px; " + (/*aspectratio*/ ctx[11]
				? `--svimg-aspect-ratio:${/*aspectratio*/ ctx[11]};`
				: '') + " ; " + /*styleName*/ ctx[2]))) {
					attr(div, "style", div_style_value);
				}

				if (dirty[0] & /*className*/ 2 && div_class_value !== (div_class_value = "wrapper " + /*className*/ ctx[1] + " svelte-c3zwza")) {
					attr(div, "class", div_class_value);
				}
			},
			i: noop,
			o: noop,
			d(detaching) {
				if (detaching) {
					detach(div);
				}

				if (if_block0) if_block0.d();
				if (if_block1) if_block1.d();
				if (if_block2) if_block2.d();
				/*div_binding*/ ctx[36](null);
				mounted = false;
				run_all(dispose);
			}
		};
	}

	function instance($$self, $$props, $$invalidate) {
		let fixedWidth;
		let imageWidth;
		let imageHeight;
		let sizes;
		let setSrcset;
		let useAspectRatioFallback;
		let { src } = $$props;
		let { alt } = $$props;
		let { class: className = "" } = $$props;
		let { style: styleName = "" } = $$props;
		let { srcset } = $$props;
		let { srcsetwebp = "" } = $$props;
		let { srcsetavif = "" } = $$props;
		let { placeholder = "" } = $$props;
		let { placeholdersrc = "" } = $$props;
		let { placeholderwebp = "" } = $$props;
		let { placeholderavif = "" } = $$props;
		let { width = "" } = $$props;
		let { aspectratio } = $$props;
		let { immediate = false } = $$props;
		let { blur = 40 } = $$props;
		let { quality = "" } = $$props;
		let { onLoad = undefined } = $$props;
		let { onError = undefined } = $$props;
		let clientWidth;
		let intersecting = false;
		let native = false;
		let container;
		let imgLoaded = false;
		let imgError = false;
		let hasResizeObserver = true;
		let hidePlaceholder = false;
		let supportsCssAspectRatio = true;
		let mounted = false;

		function onImgLoad() {
			if (onLoad) {
				onLoad();
			}

			$$invalidate(19, imgLoaded = true);

			if (!immediate) {
				setTimeout(
					() => {
						$$invalidate(21, hidePlaceholder = true);
					},
					250
				); // sync with opacity transition duration
			}
		}

		const error_handler = () => {
			if (onError) {
				onError();
			}

			$$invalidate(20, imgError = true);
		};

		function div_binding($$value) {
			binding_callbacks[$$value ? 'unshift' : 'push'](() => {
				container = $$value;
				$$invalidate(18, container);
			});
		}

		$$self.$$set = $$props => {
			if ('src' in $$props) $$invalidate(26, src = $$props.src);
			if ('alt' in $$props) $$invalidate(0, alt = $$props.alt);
			if ('class' in $$props) $$invalidate(1, className = $$props.class);
			if ('style' in $$props) $$invalidate(2, styleName = $$props.style);
			if ('srcset' in $$props) $$invalidate(3, srcset = $$props.srcset);
			if ('srcsetwebp' in $$props) $$invalidate(4, srcsetwebp = $$props.srcsetwebp);
			if ('srcsetavif' in $$props) $$invalidate(5, srcsetavif = $$props.srcsetavif);
			if ('placeholder' in $$props) $$invalidate(6, placeholder = $$props.placeholder);
			if ('placeholdersrc' in $$props) $$invalidate(7, placeholdersrc = $$props.placeholdersrc);
			if ('placeholderwebp' in $$props) $$invalidate(8, placeholderwebp = $$props.placeholderwebp);
			if ('placeholderavif' in $$props) $$invalidate(9, placeholderavif = $$props.placeholderavif);
			if ('width' in $$props) $$invalidate(10, width = $$props.width);
			if ('aspectratio' in $$props) $$invalidate(11, aspectratio = $$props.aspectratio);
			if ('immediate' in $$props) $$invalidate(12, immediate = $$props.immediate);
			if ('blur' in $$props) $$invalidate(13, blur = $$props.blur);
			if ('quality' in $$props) $$invalidate(27, quality = $$props.quality);
			if ('onLoad' in $$props) $$invalidate(28, onLoad = $$props.onLoad);
			if ('onError' in $$props) $$invalidate(14, onError = $$props.onError);
		};

		$$self.$$.update = () => {
			if ($$self.$$.dirty[0] & /*width*/ 1024) {
				$$invalidate(15, fixedWidth = !!(width && (/^[0-9]+$/).test(width)));
			}

			if ($$self.$$.dirty[0] & /*fixedWidth, clientWidth, width*/ 536904704) {
				$$invalidate(17, imageWidth = fixedWidth && clientWidth
				? Math.min(clientWidth, width)
				: fixedWidth ? width : clientWidth);
			}

			if ($$self.$$.dirty[0] & /*imageWidth, aspectratio*/ 133120) {
				$$invalidate(24, imageHeight = imageWidth / aspectratio);
			}

			if ($$self.$$.dirty[0] & /*imageWidth*/ 131072) {
				$$invalidate(16, sizes = imageWidth ? `${imageWidth}px` : undefined);
			}

			if ($$self.$$.dirty[0] & /*intersecting, immediate, sizes*/ 1073811456 | $$self.$$.dirty[1] & /*native, mounted, hasResizeObserver*/ 11) {
				$$invalidate(23, setSrcset = (immediate) && mounted && (sizes || !hasResizeObserver));
			}

			if ($$self.$$.dirty[0] & /*aspectratio, fixedWidth*/ 34816 | $$self.$$.dirty[1] & /*supportsCssAspectRatio, hasResizeObserver*/ 6) {
				$$invalidate(22, useAspectRatioFallback = !supportsCssAspectRatio  );
			}
		};

		return [
			alt,
			className,
			styleName,
			srcset,
			srcsetwebp,
			srcsetavif,
			placeholder,
			placeholdersrc,
			placeholderwebp,
			placeholderavif,
			width,
			aspectratio,
			immediate,
			blur,
			onError,
			fixedWidth,
			sizes,
			imageWidth,
			container,
			imgLoaded,
			imgError,
			hidePlaceholder,
			useAspectRatioFallback,
			setSrcset,
			imageHeight,
			onImgLoad,
			src,
			quality,
			onLoad,
			clientWidth,
			intersecting,
			native,
			hasResizeObserver,
			supportsCssAspectRatio,
			mounted,
			error_handler,
			div_binding
		];
	}

	class Image extends SvelteComponent {
		constructor(options) {
			super();

			init(
				this,
				options,
				instance,
				create_fragment,
				safe_not_equal,
				{
					src: 26,
					alt: 0,
					class: 1,
					style: 2,
					srcset: 3,
					srcsetwebp: 4,
					srcsetavif: 5,
					placeholder: 6,
					placeholdersrc: 7,
					placeholderwebp: 8,
					placeholderavif: 9,
					width: 10,
					aspectratio: 11,
					immediate: 12,
					blur: 13,
					quality: 27,
					onLoad: 28,
					onError: 14
				},
				add_css,
				[-1, -1]
			);
		}

		get src() {
			return this.$$.ctx[26];
		}

		set src(src) {
			this.$$set({ src });
			flush();
		}

		get alt() {
			return this.$$.ctx[0];
		}

		set alt(alt) {
			this.$$set({ alt });
			flush();
		}

		get class() {
			return this.$$.ctx[1];
		}

		set class(className) {
			this.$$set({ class: className });
			flush();
		}

		get style() {
			return this.$$.ctx[2];
		}

		set style(styleName) {
			this.$$set({ style: styleName });
			flush();
		}

		get srcset() {
			return this.$$.ctx[3];
		}

		set srcset(srcset) {
			this.$$set({ srcset });
			flush();
		}

		get srcsetwebp() {
			return this.$$.ctx[4];
		}

		set srcsetwebp(srcsetwebp) {
			this.$$set({ srcsetwebp });
			flush();
		}

		get srcsetavif() {
			return this.$$.ctx[5];
		}

		set srcsetavif(srcsetavif) {
			this.$$set({ srcsetavif });
			flush();
		}

		get placeholder() {
			return this.$$.ctx[6];
		}

		set placeholder(placeholder) {
			this.$$set({ placeholder });
			flush();
		}

		get placeholdersrc() {
			return this.$$.ctx[7];
		}

		set placeholdersrc(placeholdersrc) {
			this.$$set({ placeholdersrc });
			flush();
		}

		get placeholderwebp() {
			return this.$$.ctx[8];
		}

		set placeholderwebp(placeholderwebp) {
			this.$$set({ placeholderwebp });
			flush();
		}

		get placeholderavif() {
			return this.$$.ctx[9];
		}

		set placeholderavif(placeholderavif) {
			this.$$set({ placeholderavif });
			flush();
		}

		get width() {
			return this.$$.ctx[10];
		}

		set width(width) {
			this.$$set({ width });
			flush();
		}

		get aspectratio() {
			return this.$$.ctx[11];
		}

		set aspectratio(aspectratio) {
			this.$$set({ aspectratio });
			flush();
		}

		get immediate() {
			return this.$$.ctx[12];
		}

		set immediate(immediate) {
			this.$$set({ immediate });
			flush();
		}

		get blur() {
			return this.$$.ctx[13];
		}

		set blur(blur) {
			this.$$set({ blur });
			flush();
		}

		get quality() {
			return this.$$.ctx[27];
		}

		set quality(quality) {
			this.$$set({ quality });
			flush();
		}

		get onLoad() {
			return this.$$.ctx[28];
		}

		set onLoad(onLoad) {
			this.$$set({ onLoad });
			flush();
		}

		get onError() {
			return this.$$.ctx[14];
		}

		set onError(onError) {
			this.$$set({ onError });
			flush();
		}
	}

	create_custom_element(Image, {"src":{},"alt":{},"class":{},"style":{},"srcset":{},"srcsetwebp":{},"srcsetavif":{},"placeholder":{},"placeholdersrc":{},"placeholderwebp":{},"placeholderavif":{},"width":{},"aspectratio":{},"immediate":{"type":"Boolean"},"blur":{},"quality":{},"onLoad":{},"onError":{}}, [], [], true);

	if (typeof window !== undefined && window.customElements) {
	    customElements.define('s-image', Image);
	}

})();
