(function () {
    'use strict';

    function noop() { }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    let src_url_equal_anchor;
    function src_url_equal(element_src, url) {
        if (!src_url_equal_anchor) {
            src_url_equal_anchor = document.createElement('a');
        }
        src_url_equal_anchor.href = url;
        return element_src === src_url_equal_anchor.href;
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        if (node.parentNode) {
            node.parentNode.removeChild(node);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function attribute_to_object(attributes) {
        const result = {};
        for (const attribute of attributes) {
            result[attribute.name] = attribute.value;
        }
        return result;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error('Function called outside component initialization');
        return current_component;
    }
    /**
     * The `onMount` function schedules a callback to run as soon as the component has been mounted to the DOM.
     * It must be called during the component's initialisation (but doesn't need to live *inside* the component;
     * it can be called from an external module).
     *
     * `onMount` does not run inside a [server-side component](/docs#run-time-server-side-component-api).
     *
     * https://svelte.dev/docs#run-time-svelte-onmount
     */
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }

    const dirty_components = [];
    const binding_callbacks = [];
    let render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = /* @__PURE__ */ Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function tick() {
        schedule_update();
        return resolved_promise;
    }
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
            }
            catch (e) {
                // reset dirty state to not end up in a deadlocked state and then rethrow
                dirty_components.length = 0;
                flushidx = 0;
                throw e;
            }
            set_current_component(null);
            dirty_components.length = 0;
            flushidx = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
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
     */
    function flush_render_callbacks(fns) {
        const filtered = [];
        const targets = [];
        render_callbacks.forEach((c) => fns.indexOf(c) === -1 ? filtered.push(c) : targets.push(c));
        targets.forEach((c) => c());
        render_callbacks = filtered;
    }
    const outroing = new Set();
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
                // if the component was destroyed immediately
                // it will update the `$$.on_destroy` reference to `null`.
                // the destructured on_destroy may still reference to the old array
                if (component.$$.on_destroy) {
                    component.$$.on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
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
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
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
        };
        append_styles && append_styles($$.root);
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
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
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            flush();
        }
        set_current_component(parent_component);
    }
    let SvelteElement;
    if (typeof HTMLElement === 'function') {
        SvelteElement = class extends HTMLElement {
            constructor() {
                super();
                this.attachShadow({ mode: 'open' });
            }
            connectedCallback() {
                const { on_mount } = this.$$;
                this.$$.on_disconnect = on_mount.map(run).filter(is_function);
                // @ts-ignore todo: improve typings
                for (const key in this.$$.slotted) {
                    // @ts-ignore todo: improve typings
                    this.appendChild(this.$$.slotted[key]);
                }
            }
            attributeChangedCallback(attr, _oldValue, newValue) {
                this[attr] = newValue;
            }
            disconnectedCallback() {
                run_all(this.$$.on_disconnect);
            }
            $destroy() {
                destroy_component(this, 1);
                this.$destroy = noop;
            }
            $on(type, callback) {
                // TODO should this delegate to addEventListener?
                if (!is_function(callback)) {
                    return noop;
                }
                const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
                callbacks.push(callback);
                return () => {
                    const index = callbacks.indexOf(callback);
                    if (index !== -1)
                        callbacks.splice(index, 1);
                };
            }
            $set($$props) {
                if (this.$$set && !is_empty($$props)) {
                    this.$$.skip_bound = true;
                    this.$$set($$props);
                    this.$$.skip_bound = false;
                }
            }
        };
    }

    /* src/Image.svelte generated by Svelte v3.59.2 */

    function create_if_block_5(ctx) {
    	let source;
    	let source_srcset_value;

    	return {
    		c() {
    			source = element("source");
    			attr(source, "type", "image/avif");

    			attr(source, "srcset", source_srcset_value = /*setSrcset*/ ctx[23]
    			? /*srcsetavif*/ ctx[5]
    			: undefined);

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
    			if (detaching) detach(source);
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

    			attr(source, "srcset", source_srcset_value = /*setSrcset*/ ctx[23]
    			? /*srcsetwebp*/ ctx[4]
    			: undefined);

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
    			if (detaching) detach(source);
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
    			if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
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
    			attr(img, "class", "placeholder");
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
    			if (detaching) detach(img);
    		}
    	};
    }

    // (180:4) {#if placeholdersrc}
    function create_if_block_1(ctx) {
    	let picture;
    	let t0;
    	let t1;
    	let img;
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
    			attr(img, "class", "placeholder");
    			attr(img, "srcset", /*placeholdersrc*/ ctx[7]);
    			attr(img, "alt", /*alt*/ ctx[0]);
    			attr(img, "width", /*imageWidth*/ ctx[17]);
    			attr(img, "height", /*imageHeight*/ ctx[24]);

    			attr(img, "style", img_style_value = /*useAspectRatioFallback*/ ctx[22]
    			? `width:${/*imageWidth*/ ctx[17]}px; height:${/*imageHeight*/ ctx[24]}px;`
    			: "");
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

    			if (dirty[0] & /*placeholdersrc*/ 128) {
    				attr(img, "srcset", /*placeholdersrc*/ ctx[7]);
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
    			if (detaching) detach(picture);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    		}
    	};
    }

    // (182:8) {#if placeholderavif}
    function create_if_block_3(ctx) {
    	let source;

    	return {
    		c() {
    			source = element("source");
    			attr(source, "type", "image/avif");
    			attr(source, "srcset", /*placeholderavif*/ ctx[9]);
    		},
    		m(target, anchor) {
    			insert(target, source, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*placeholderavif*/ 512) {
    				attr(source, "srcset", /*placeholderavif*/ ctx[9]);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(source);
    		}
    	};
    }

    // (185:8) {#if placeholderwebp}
    function create_if_block_2(ctx) {
    	let source;

    	return {
    		c() {
    			source = element("source");
    			attr(source, "type", "image/webp");
    			attr(source, "srcset", /*placeholderwebp*/ ctx[8]);
    		},
    		m(target, anchor) {
    			insert(target, source, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*placeholderwebp*/ 256) {
    				attr(source, "srcset", /*placeholderwebp*/ ctx[8]);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(source);
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
    			this.c = noop;
    			attr(img, "srcset", img_srcset_value = /*setSrcset*/ ctx[23] ? /*srcset*/ ctx[3] : undefined);
    			attr(img, "sizes", /*sizes*/ ctx[16]);

    			attr(img, "alt", img_alt_value = /*imgLoaded*/ ctx[19] || /*imgError*/ ctx[20]
    			? /*alt*/ ctx[0]
    			: undefined);

    			attr(img, "width", /*imageWidth*/ ctx[17]);
    			attr(img, "height", /*imageHeight*/ ctx[24]);
    			attr(img, "loading", img_loading_value = !/*immediate*/ ctx[12] ? "lazy" : undefined);

    			attr(img, "class", img_class_value = "image " + /*className*/ ctx[1] + " " + (/*imgLoaded*/ ctx[19] || /*immediate*/ ctx[12]
    			? 'loaded'
    			: ''));

    			attr(img, "style", /*styleName*/ ctx[2]);

    			attr(div, "style", div_style_value = "" + ((/*fixedWidth*/ ctx[15]
    			? `max-width:${/*width*/ ctx[10]}px;`
    			: '') + " --svimg-blur:" + /*blur*/ ctx[13] + "px; " + (/*aspectratio*/ ctx[11]
    			? `--svimg-aspect-ratio:${/*aspectratio*/ ctx[11]};`
    			: '') + " ; " + /*styleName*/ ctx[2]));

    			attr(div, "class", div_class_value = "wrapper " + /*className*/ ctx[1]);
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
    			: ''))) {
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

    			if (dirty[0] & /*className*/ 2 && div_class_value !== (div_class_value = "wrapper " + /*className*/ ctx[1])) {
    				attr(div, "class", div_class_value);
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div);
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

    	function initialize() {
    		let ro;

    		if (window.ResizeObserver) {
    			ro = new ResizeObserver(entries => {
    					$$invalidate(29, clientWidth = entries[0].contentRect.width);
    				});

    			ro.observe(container);
    		} else {
    			$$invalidate(32, hasResizeObserver = false);
    		}

    		$$invalidate(33, supportsCssAspectRatio = CSS.supports("aspect-ratio", "var(--svimg-aspect-ratio)"));
    		$$invalidate(31, native = "loading" in HTMLImageElement.prototype);

    		if (native || immediate) {
    			return () => {
    				if (ro) {
    					ro.unobserve(container);
    				}
    			};
    		}

    		const io = new IntersectionObserver(entries => {
    				$$invalidate(30, intersecting = entries[0].isIntersecting);

    				if (intersecting) {
    					io.unobserve(container);
    				}
    			},
    		{ rootMargin: `100px` });

    		io.observe(container);

    		return () => {
    			io.unobserve(container);

    			if (ro) {
    				ro.unobserve(container);
    			}
    		};
    	}

    	onMount(async () => {
    		// src attribute must be set after onload to ensure
    		// the onload handler still fires for immediate images
    		$$invalidate(34, mounted = true);

    		if (container) {
    			return initialize();
    		}

    		// older versions of Svelte need to wait for the DOM
    		// to be updated before bind:this references are available
    		await tick();

    		// the component may have been unmounted by this point
    		if (container) {
    			return initialize();
    		}
    	});

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
    			$$invalidate(23, setSrcset = (intersecting || native || immediate) && mounted && (sizes || !hasResizeObserver));
    		}

    		if ($$self.$$.dirty[0] & /*aspectratio, fixedWidth*/ 34816 | $$self.$$.dirty[1] & /*supportsCssAspectRatio, hasResizeObserver*/ 6) {
    			$$invalidate(22, useAspectRatioFallback = !supportsCssAspectRatio && aspectratio && (fixedWidth || hasResizeObserver));
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

    class Image extends SvelteElement {
    	constructor(options) {
    		super();
    		const style = document.createElement('style');
    		style.textContent = `.wrapper{display:grid;grid:1fr / 1fr;gap:0px;grid-gap:0px;overflow:hidden}.wrapper>*{grid-area:1 / 1 / 2 / 2}.wrapper img{width:100%;height:100%;display:block;aspect-ratio:var(--svimg-aspect-ratio)}.image{opacity:0;transition:opacity 0.25s ease-in}.image.loaded{opacity:1}.placeholder{z-index:-1;filter:blur(var(--svimg-blur))}`;
    		this.shadowRoot.appendChild(style);

    		init(
    			this,
    			{
    				target: this.shadowRoot,
    				props: attribute_to_object(this.attributes),
    				customElement: true
    			},
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
    			null,
    			[-1, -1]
    		);

    		if (options) {
    			if (options.target) {
    				insert(options.target, this, options.anchor);
    			}

    			if (options.props) {
    				this.$set(options.props);
    				flush();
    			}
    		}
    	}

    	static get observedAttributes() {
    		return [
    			"src",
    			"alt",
    			"class",
    			"style",
    			"srcset",
    			"srcsetwebp",
    			"srcsetavif",
    			"placeholder",
    			"placeholdersrc",
    			"placeholderwebp",
    			"placeholderavif",
    			"width",
    			"aspectratio",
    			"immediate",
    			"blur",
    			"quality",
    			"onLoad",
    			"onError"
    		];
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

    if (typeof window !== undefined && window.customElements) {
        customElements.define('s-image', Image);
    }

})();
