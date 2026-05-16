/**
 * Footer Physics System
 * Handles interactive physics for footer elements with gravity, natural behavior, and drag
 * Optimized for smooth, realistic motion
 */

(function() {
  'use strict';

  let items = [];
  let dragging = null;
  let dragOffset = {x: 0, y: 0}; // Kept at 0 during drag so element center follows the cursor
  let animating = false;
  let setupDone = false;
  let dragHistory = [];
  let lastDragTime = 0;
  let targetDragX = 0;
  let targetDragY = 0;
  let currentDragX = 0;
  let currentDragY = 0;
  let lastFrameTime = 0;
  let resizeTimeout = null;
  let lastContainerSize = { width: 0, height: 0 };
  /** When false, skip physics simulation to save CPU (footer off-screen). Dragging still wakes the loop. */
  let footerInView = true;
  let idleFrameScheduled = false;
  let lastVvWidth = 0;
  let lastVvHeight = 0;
  /** Latest pointer position in viewport coords — updated on every move, applied every animation frame while dragging */
  let lastPointerClient = { x: 0, y: 0 };

  function getPhysicsInnerContainer() {
    if (typeof safeQuerySelector !== 'function' || typeof CONFIG === 'undefined') {
      return null;
    }
    const footer = safeQuerySelector(CONFIG.SELECTORS.FOOTER);
    if (!footer) return null;
    const physicsContainer = safeQuerySelector(CONFIG.SELECTORS.PHYSICS_CONTAINER, footer);
    if (!physicsContainer) return null;
    return safeQuerySelector('div[draggable="false"]', physicsContainer);
  }

  function getPointerClientXY(e) {
    if (e.touches && e.touches.length > 0) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    if (e.changedTouches && e.changedTouches.length > 0) {
      return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    }
    return { x: e.clientX || 0, y: e.clientY || 0 };
  }

  function getDragScale(item) {
    const currentTime = performance.now();
    const dragElapsed = currentTime - (item.dragStartTime || currentTime);
    const scaleTransitionDuration = 150;
    if (dragElapsed < scaleTransitionDuration) {
      const scaleProgress = dragElapsed / scaleTransitionDuration;
      const eased = 1 - Math.pow(1 - scaleProgress, 3);
      return 1.08 - (0.03 * eased);
    }
    return 1.05;
  }

  function mountDragToBody(item) {
    if (!item || !item.el || item.dragMountedToBody) return;
    item.dragRestore = {
      parent: item.el.parentNode,
      nextSibling: item.el.nextSibling
    };
    document.body.appendChild(item.el);
    item.dragMountedToBody = true;
  }

  function unmountDragFromBody(item) {
    if (!item || !item.el || !item.dragMountedToBody) return;
    const innerContainer = item.dragInnerContainer || getPhysicsInnerContainer();
    const restore = item.dragRestore;
    if (innerContainer) {
      innerContainer.appendChild(item.el);
    } else if (restore && restore.parent) {
      if (restore.nextSibling && restore.nextSibling.parentNode === restore.parent) {
        restore.parent.insertBefore(item.el, restore.nextSibling);
      } else {
        restore.parent.appendChild(item.el);
      }
    }
    item.dragMountedToBody = false;
    item.dragRestore = null;
  }

  function applyPhysicsTransform(item, scale) {
    if (!item || !item.el || !item.el.style) return;
    const s = scale != null ? scale : 1;
    const rotationDeg = (item.rotation || 0) * 180 / Math.PI;
    item.el.style.position = 'absolute';
    item.el.style.left = '';
    item.el.style.top = '';
    item.el.style.right = '';
    item.el.style.bottom = '';
    item.el.style.margin = '0';
    item.el.style.transform = `translate3d(${item.x}px, ${item.y}px, 0) translate(-50%, -50%) rotate(${rotationDeg}deg) scale(${s})`;
    item.el.style.transformOrigin = 'center center';
  }

  /** Element center locked to cursor via viewport fixed positioning (avoids Framer transform offset bugs) */
  function syncDragToPointer(item, clientX, clientY) {
    if (!item || !item.el || !item.el.style) return;

    const innerContainer = item.dragInnerContainer || getPhysicsInnerContainer();
    if (!innerContainer) return;

    let containerRect;
    try {
      containerRect = innerContainer.getBoundingClientRect();
    } catch (error) {
      return;
    }
    if (!containerRect || containerRect.width === 0 || containerRect.height === 0) return;

    const pointerX = clientX - containerRect.left;
    const pointerY = clientY - containerRect.top;

    const halfW = (item.width > 0 ? item.width : 50) / 2;
    const halfH = (item.height > 0 ? item.height : 50) / 2;
    const minX = halfW;
    const maxX = Math.max(halfW, containerRect.width - halfW);
    const minY = halfH;
    const maxY = Math.max(halfH, containerRect.height - halfH);

    const x = Math.max(minX, Math.min(maxX, pointerX + dragOffset.x));
    const y = Math.max(minY, Math.min(maxY, pointerY + dragOffset.y));

    item.x = x;
    item.y = y;
    targetDragX = x;
    targetDragY = y;
    currentDragX = x;
    currentDragY = y;

    mountDragToBody(item);

    const rotationDeg = (item.rotation || 0) * 180 / Math.PI;
    const scale = getDragScale(item);
    item.el.style.position = 'fixed';
    item.el.style.left = clientX + 'px';
    item.el.style.top = clientY + 'px';
    item.el.style.right = 'auto';
    item.el.style.bottom = 'auto';
    item.el.style.margin = '0';
    item.el.style.transform = `translate(-50%, -50%) rotate(${rotationDeg}deg) scale(${scale})`;
    item.el.style.transition = 'none';
    item.el.style.pointerEvents = 'none';
    item.el.style.transformOrigin = 'center center';
    item.el.style.filter = 'drop-shadow(0 8px 16px rgba(0, 0, 0, 0.15))';
    item.el.style.zIndex = '100000';
  }

  function scheduleNextAnimationFrame() {
    const anyTransient = dragging !== null || items.some(function(it) {
      return it && it.dropping;
    });
    if (footerInView || anyTransient) {
      idleFrameScheduled = false;
      requestAnimationFrame(animate);
    } else if (!idleFrameScheduled) {
      idleFrameScheduled = true;
      setTimeout(function() {
        idleFrameScheduled = false;
        requestAnimationFrame(animate);
      }, 250);
    }
  }

  function attachFooterVisibilityObserver(footerEl) {
    if (!footerEl || typeof IntersectionObserver === 'undefined') return;
    try {
      const obs = new IntersectionObserver(
        function(entries) {
          for (let i = 0; i < entries.length; i++) {
            if (entries[i].isIntersecting) {
              footerInView = true;
              return;
            }
          }
          // Avoid pausing physics mid-gesture if the footer briefly clips the root (e.g. while dragging).
          if (dragging === null) {
            footerInView = false;
          }
        },
        { root: null, rootMargin: '320px 0px 320px 0px', threshold: 0 }
      );
      obs.observe(footerEl);
    } catch (e) {
      footerInView = true;
    }
  }

  function handleResize() {
    // Throttle resize events for better performance
    if (resizeTimeout) {
      clearTimeout(resizeTimeout);
    }
    
    resizeTimeout = setTimeout(() => {
      if (typeof safeQuerySelector === 'function' && typeof CONFIG !== 'undefined') {
        const footer = safeQuerySelector(CONFIG.SELECTORS.FOOTER);
        if (!footer) return;
        
        const physicsContainer = safeQuerySelector(CONFIG.SELECTORS.PHYSICS_CONTAINER, footer);
        if (!physicsContainer) return;
        
        const innerContainer = safeQuerySelector('div[draggable="false"]', physicsContainer);
        if (!innerContainer) return;
        
        // Force reflow to get accurate dimensions (cross-browser)
        void innerContainer.offsetHeight;
        
        // Safety check before getBoundingClientRect
        let containerRect;
        try {
          containerRect = innerContainer.getBoundingClientRect();
        } catch (error) {
          console.warn('[PHYSICS] Error getting container bounds in handleResize:', error);
          return;
        }
        
        if (!containerRect) return;
        
        // Use viewport dimensions as fallback for better mobile support
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth || containerRect.width;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || containerRect.height;
        
        // Get actual container dimensions
        const newWidth = containerRect.width || viewportWidth;
        const newHeight = containerRect.height || viewportHeight;
        
        // Only update if size actually changed (with small threshold to avoid unnecessary updates)
        const widthDiff = Math.abs(newWidth - lastContainerSize.width);
        const heightDiff = Math.abs(newHeight - lastContainerSize.height);
        const threshold = 5; // 5px threshold
        
        if (widthDiff > threshold || heightDiff > threshold) {
          lastContainerSize.width = newWidth;
          lastContainerSize.height = newHeight;
          
          // Update element positions if container resized
          // Recalculate positions to keep elements within bounds
          items.forEach(item => {
            // CRITICAL FIX: Check item, item.el, and item.el.style before accessing
            if (!item || !item.el || item.dragging) return;
            if (!item.el.style || typeof item.el.style !== 'object') return;
            
            const halfW = item.width / 2;
            const halfH = item.height / 2;
            
            // Constrain to new container bounds
            item.x = Math.max(halfW, Math.min(newWidth - halfW, item.x));
            item.y = Math.max(halfH, Math.min(newHeight - halfH, item.y));
            
            // Update visual position immediately - double-check style exists
            if (item.el && item.el.style) {
              const rotationDeg = (item.rotation || 0) * 180 / Math.PI;
              // Cross-browser transform support
              item.el.style.transform = `translate3d(${item.x}px, ${item.y}px, 0) translate(-50%, -50%) rotate(${rotationDeg}deg) scale(1)`;
              item.el.style.webkitTransform = item.el.style.transform; // Safari
            }
          });
          
          if (CONFIG && CONFIG.DEV_MODE) {
            console.log('[PHYSICS] Container resized:', newWidth, 'x', newHeight);
          }
        }
      }
    }, 200); // Slightly longer throttle for better mobile performance
  }

  // Function to fix SVG container sizes to match SVG natural dimensions exactly
  function fixSVGContainerSizes(elements) {
    elements.forEach(el => {
      try {
        if (!el || !el.style) return;
        
        // Find SVG inside the physics-body element (search deeply)
        let svg = el.querySelector('svg');
        if (!svg) return;
        
        let naturalWidth = null;
        let naturalHeight = null;
        
        // PRIORITY 1: Get dimensions from viewBox (most reliable - matches SVG content)
        const viewBox = svg.getAttribute('viewBox');
        if (viewBox) {
          const viewBoxValues = viewBox.trim().split(/[\s,]+/);
          if (viewBoxValues.length >= 4) {
            const svgWidth = parseFloat(viewBoxValues[2]);
            const svgHeight = parseFloat(viewBoxValues[3]);
            if (!isNaN(svgWidth) && !isNaN(svgHeight) && svgWidth > 0 && svgHeight > 0) {
              naturalWidth = svgWidth;
              naturalHeight = svgHeight;
            }
          }
        }
        
        // PRIORITY 2: If no viewBox, try width/height attributes
        if (!naturalWidth || !naturalHeight) {
          let svgWidth = svg.getAttribute('width');
          let svgHeight = svg.getAttribute('height');
          
          // Remove 'px' if present
          if (svgWidth) svgWidth = svgWidth.replace('px', '').trim();
          if (svgHeight) svgHeight = svgHeight.replace('px', '').trim();
          
          const parsedWidth = parseFloat(svgWidth);
          const parsedHeight = parseFloat(svgHeight);
          if (!isNaN(parsedWidth) && !isNaN(parsedHeight) && parsedWidth > 0 && parsedHeight > 0) {
            naturalWidth = parsedWidth;
            naturalHeight = parsedHeight;
          }
        }
        
        // PRIORITY 3: Check computed style for width/height
        if (!naturalWidth || !naturalHeight) {
          const svgStyle = window.getComputedStyle(svg);
          const computedWidth = parseFloat(svgStyle.width);
          const computedHeight = parseFloat(svgStyle.height);
          if (!isNaN(computedWidth) && !isNaN(computedHeight) && computedWidth > 0 && computedHeight > 0) {
            naturalWidth = computedWidth;
            naturalHeight = computedHeight;
          }
        }
        
        // PRIORITY 4: Use bounding rect as last resort
        if (!naturalWidth || !naturalHeight) {
          try {
            const svgRect = svg.getBoundingClientRect();
            if (svgRect && svgRect.width > 0 && svgRect.height > 0) {
              naturalWidth = svgRect.width;
              naturalHeight = svgRect.height;
            }
          } catch (error) {
            console.warn('[PHYSICS] Error getting SVG bounds:', error);
          }
        }
        
        // Set container to match SVG size EXACTLY
        if (naturalWidth && naturalHeight && naturalWidth > 0 && naturalHeight > 0) {
          // Force exact pixel values
          el.style.width = Math.round(naturalWidth) + 'px';
          el.style.height = Math.round(naturalHeight) + 'px';
          
          // Ensure all intermediate containers are 100%
          let currentElement = svg;
          while (currentElement && currentElement !== el) {
            if (currentElement.style) {
              currentElement.style.width = '100%';
              currentElement.style.height = '100%';
            }
            currentElement = currentElement.parentElement;
            if (!currentElement || currentElement === document.body) break;
          }
          
          // Ensure SVG fills its container
          svg.style.width = '100%';
          svg.style.height = '100%';
          
          // Fix SVG container specifically
          const svgContainer = svg.closest('.svgContainer');
          if (svgContainer && svgContainer.style) {
            svgContainer.style.width = '100%';
            svgContainer.style.height = '100%';
          }
          
          // Fix parent divs
          let parentDiv = svg.parentElement;
          while (parentDiv && parentDiv !== el) {
            if (parentDiv.style) {
              parentDiv.style.width = '100%';
              parentDiv.style.height = '100%';
            }
            parentDiv = parentDiv.parentElement;
            if (!parentDiv || parentDiv === document.body) break;
          }
          
          if (CONFIG && CONFIG.DEV_MODE) {
            console.log('[PHYSICS] Fixed SVG container size:', {
              element: el.id || 'physics-body',
              width: Math.round(naturalWidth),
              height: Math.round(naturalHeight),
              viewBox: svg.getAttribute('viewBox')
            });
          }
        }
      } catch (error) {
        console.warn('[PHYSICS] Error fixing SVG container size:', error);
      }
    });
  }

  function setupPhysics() {
    if (setupDone && items.length > 0) return;

    // Safety checks for dependencies
    if (typeof safeQuerySelector !== 'function') {
      console.warn('[PHYSICS] safeQuerySelector not available');
      return;
    }
    if (typeof CONFIG === 'undefined' || !CONFIG.SELECTORS) {
      console.warn('[PHYSICS] CONFIG not available');
      return;
    }

    const footer = safeQuerySelector(CONFIG.SELECTORS.FOOTER);
    if (!footer) {
      if (CONFIG.DEV_MODE) console.log('[PHYSICS] Footer not found');
      return;
    }

    const physicsContainer = safeQuerySelector(CONFIG.SELECTORS.PHYSICS_CONTAINER, footer);
    if (!physicsContainer) {
      if (CONFIG.DEV_MODE) console.log('[PHYSICS] Physics container not found');
      return;
    }

    const innerContainer = safeQuerySelector('div[draggable="false"]', physicsContainer);
    if (!innerContainer) {
      if (CONFIG.DEV_MODE) console.log('[PHYSICS] Inner container not found');
      return;
    }

    // FORCE container to be interactive
    innerContainer.style.pointerEvents = 'auto';
    innerContainer.style.position = 'relative';
    innerContainer.style.overflow = 'visible';
    innerContainer.style.height = '100%';
    innerContainer.style.width = '100%';

    // Find elements by ID pattern
    const footerElements = Array.from(footer.querySelectorAll('[id^="physics-body-footer"]'));
    const genericElements = Array.from(innerContainer.querySelectorAll('#physics-body'));
    const allElements = Array.from(new Set([...footerElements, ...genericElements]));
    
    // Fix SVG container sizes BEFORE processing physics
    fixSVGContainerSizes(allElements);
    
    // Force a reflow to ensure sizes are applied
    if (allElements.length > 0) {
      void allElements[0].offsetHeight;
    }
    
    // Fix sizes again after reflow to ensure accuracy
    setTimeout(() => {
      fixSVGContainerSizes(allElements);
    }, 10);
    
    if (CONFIG && CONFIG.DEV_MODE) {
      console.log('[PHYSICS] Found', allElements.length, 'elements');
    }

    if (allElements.length === 0) {
      if (CONFIG && CONFIG.DEV_MODE) console.log('[PHYSICS] No physics elements found!');
      return;
    }

    items = [];

    allElements.forEach((el) => {
      try {
        // Safety checks
        if (!el || typeof el !== 'object' || !el.nodeType) return;
        if (!innerContainer.contains(el)) return;
        if (el.dataset && el.dataset.physicsActive) return;
        if (!el.style) return; // Element must have style property

        el.dataset.physicsActive = 'true';

        // Get current position
        let rect;
        let style;
        try {
          rect = el.getBoundingClientRect();
          style = window.getComputedStyle(el);
        } catch (error) {
          console.warn('[PHYSICS] Error getting element bounds:', error);
          return;
        }
        
        if (!rect || !style) return;
        
        // Safety check before getBoundingClientRect
        let containerRect;
        try {
          containerRect = innerContainer.getBoundingClientRect();
        } catch (error) {
          console.warn('[PHYSICS] Error getting container bounds in setupPhysics:', error);
          return;
        }
        
        if (!containerRect) return;
        
        // Always calculate center position from actual visual position
        // This ensures consistency regardless of how the element was initially positioned
        const x = rect.left + rect.width / 2 - containerRect.left;
        const y = rect.top + rect.height / 2 - containerRect.top;
        
        const transform = style.transform;
        let rotation = 0;

        // Extract rotation
        if (transform && transform !== 'none') {
          const rotateMatch = transform.match(/rotate\(([^)]+)\)/);
          if (rotateMatch) {
            const rotValue = rotateMatch[1];
            if (rotValue.includes('rad')) {
              rotation = parseFloat(rotValue.replace('rad', ''));
            } else if (rotValue.includes('deg')) {
              rotation = parseFloat(rotValue.replace('deg', '')) * Math.PI / 180;
            } else {
              rotation = parseFloat(rotValue) * Math.PI / 180;
            }
          }
        }

        const item = {
          el: el,
          x: x,
          y: y,
          vx: (Math.random() - 0.5) * 2,
          vy: (Math.random() - 0.5) * 2,
          width: rect.width,
          height: rect.height,
          rotation: rotation,
          angularVelocity: (Math.random() - 0.5) * 0.08,
          dragging: false,
          dropping: false,
          dropStartTime: 0
        };

        items.push(item);

        // Optimize styles for performance
        el.style.cursor = 'grab';
        el.style.pointerEvents = 'auto';
        el.style.userSelect = 'none';
        el.style.touchAction = 'none';
        el.style.willChange = 'transform';
        el.style.position = 'absolute';
        el.style.backfaceVisibility = 'hidden';
        el.style.transformOrigin = 'center center';
        
        // Get updated rect after SVG size fix - force a reflow to get accurate size
        // Force browser to recalculate layout
        void el.offsetHeight;
        rect = el.getBoundingClientRect();
        
        // Ensure clickable area matches element size exactly (now matches SVG)
        // Use the dimensions we set from SVG viewBox
        const finalWidth = rect.width > 0 ? rect.width : parseFloat(el.style.width) || 100;
        const finalHeight = rect.height > 0 ? rect.height : parseFloat(el.style.height) || 100;
        
        el.style.width = finalWidth + 'px';
        el.style.height = finalHeight + 'px';
        el.style.boxSizing = 'border-box';
        el.style.padding = '0';
        el.style.margin = '0';
        el.style.overflow = 'visible';
        
        // Update item dimensions to match
        item.width = finalWidth;
        item.height = finalHeight;

        // Replace Framer top/left + translate(50%,50%) with physics transform so position matches drag/release
        el.style.top = '';
        el.style.left = '';
        applyPhysicsTransform(item);

        // Block pointer events on children (only for Element nodes)
        // This ensures only the parent element receives clicks, matching its exact size
        Array.from(el.querySelectorAll('*')).forEach(child => {
          if (child && child.nodeType === Node.ELEMENT_NODE && child.style) {
            child.style.pointerEvents = 'none';
          }
        });

        el.removeAttribute('draggable');

        // Add event listeners (pointerdown preferred so setPointerCapture keeps drag glued to cursor)
        const dragStart = (e) => startDrag(e, item);
        if (typeof PointerEvent !== 'undefined') {
          el.addEventListener('pointerdown', dragStart, true);
        } else {
          el.addEventListener('mousedown', dragStart, true);
          el.addEventListener('touchstart', dragStart, {passive: false, capture: true});
        }
      } catch (error) {
        console.warn('[PHYSICS] Error processing element:', error);
        // Continue with next element
      }
    });

    if (CONFIG && CONFIG.DEV_MODE) console.log('[PHYSICS] Setup complete!', items.length, 'items');
    setupDone = true;

    attachFooterVisibilityObserver(footer);

    if (!animating && items.length > 0) {
      animating = true;
      lastFrameTime = performance.now();
      animate();
    }
  }

  function releaseDragPointerCapture(item) {
    if (!item || !item.el || item.activePointerId == null) return;
    try {
      if (item.el.releasePointerCapture) {
        item.el.releasePointerCapture(item.activePointerId);
      }
    } catch (err) {
      /* ignore */
    }
    item.activePointerId = null;
  }

  function startDrag(e, item) {
    e.preventDefault();
    e.stopPropagation();

    // CRITICAL FIX: Check item, item.el, and item.el.style before accessing
    if (!item || !item.el) return;
    if (!item.el.style || typeof item.el.style !== 'object') return;

    if (e.type === 'mouseup' || e.type === 'pointerup') return;
    if (typeof e.button === 'number' && e.button !== 0) return;
    if (typeof e.isPrimary === 'boolean' && !e.isPrimary) return;

    footerInView = true;

    if (typeof safeQuerySelector !== 'function' || typeof CONFIG === 'undefined') {
      return;
    }

    const footer = safeQuerySelector(CONFIG.SELECTORS.FOOTER);
    const physicsContainer = footer ? safeQuerySelector(CONFIG.SELECTORS.PHYSICS_CONTAINER, footer) : null;
    const innerContainer = physicsContainer ? safeQuerySelector('div[draggable="false"]', physicsContainer) : null;

    if (!innerContainer) return;

    // Safety check before getBoundingClientRect
    let containerRect;
    try {
      containerRect = innerContainer.getBoundingClientRect();
    } catch (error) {
      console.warn('[PHYSICS] Error getting container bounds in startDrag:', error);
      return;
    }
    
    if (!containerRect) return;
    
    // Handle both mouse and touch events properly
    let clientX, clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if (e.changedTouches && e.changedTouches.length > 0) {
      // Handle touchend events
      clientX = e.changedTouches[0].clientX;
      clientY = e.changedTouches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    // Get element's current actual visual position - DON'T CHANGE IT
    // Safety check before getBoundingClientRect
    let elementRect;
    try {
      elementRect = item.el.getBoundingClientRect();
    } catch (error) {
      console.warn('[PHYSICS] Error getting element bounds in startDrag:', error);
      return;
    }
    
    if (!elementRect || elementRect.width === 0 || elementRect.height === 0) {
      return;
    }

    // Clear Framer top/left before measuring — they fight translate3d() and push the shape away from the cursor
    if (item.el.style) {
      item.el.style.top = '';
      item.el.style.left = '';
    }

    dragging = item;
    item.dragging = true;
    item.dropping = false;
    item.vx = 0;
    item.vy = 0;
    item.angularVelocity = 0;
    item.dragInnerContainer = innerContainer;

    item.activePointerId = null;
    if (typeof e.pointerId === 'number' && item.el.setPointerCapture) {
      try {
        item.el.setPointerCapture(e.pointerId);
        item.activePointerId = e.pointerId;
      } catch (err) {
        item.activePointerId = null;
      }
    }

    // Center of shape follows the cursor (no grab-point offset)
    dragOffset.x = 0;
    dragOffset.y = 0;

    // Reset drag state
    dragHistory = [];
    lastDragTime = performance.now();

    lastPointerClient.x = clientX;
    lastPointerClient.y = clientY;
    syncDragToPointer(item, clientX, clientY);
    dragHistory.push({ x: item.x, y: item.y, time: lastDragTime });

    if (item.el && item.el.style) {
      // Enhanced visual feedback for drag start
      item.el.style.cursor = 'grabbing';
      item.el.style.opacity = '1';
      item.el.style.zIndex = '10000';
      item.el.style.transition = 'none'; // No transitions during drag
      item.el.style.willChange = 'transform';
      item.el.style.visibility = 'visible';
      item.el.style.display = '';
      item.el.style.pointerEvents = 'none';
      
      // Store initial scale for smooth animation
      item.initialScale = 1.0;
      item.dragStartTime = performance.now();
      item.el.style.transition = 'none';
      item.el.style.pointerEvents = 'none';
    }
  }

  function animate() {
    try {
      if (items.length === 0) {
        animating = false;
        return;
      }

      const anyPointerActive = dragging !== null || items.some(function(it) {
        return it && it.dropping;
      });
      if (!footerInView && !anyPointerActive) {
        scheduleNextAnimationFrame();
        return;
      }

      // Use safeQuerySelector and CONFIG for consistency and error handling
      const footer = (typeof safeQuerySelector === 'function' && typeof CONFIG !== 'undefined')
        ? safeQuerySelector(CONFIG.SELECTORS.FOOTER)
        : document.getElementById('footer');
      
      if (!footer) {
        scheduleNextAnimationFrame();
        return;
      }

      const physicsContainer = (typeof safeQuerySelector === 'function' && typeof CONFIG !== 'undefined')
        ? safeQuerySelector(CONFIG.SELECTORS.PHYSICS_CONTAINER, footer)
        : footer.querySelector('[data-framer-name="Physics DSK"]');
      
      if (!physicsContainer) {
        scheduleNextAnimationFrame();
        return;
      }

      const innerContainer = (typeof safeQuerySelector === 'function')
        ? safeQuerySelector('div[draggable="false"]', physicsContainer)
        : physicsContainer.querySelector('div[draggable="false"]');

      if (!innerContainer) {
        scheduleNextAnimationFrame();
        return;
      }
      
      // Safety check: ensure getBoundingClientRect is available
      if (typeof innerContainer.getBoundingClientRect !== 'function') {
        scheduleNextAnimationFrame();
        return;
      }

      const currentTime = performance.now();
      const deltaTime = lastFrameTime > 0 ? Math.min((currentTime - lastFrameTime) / 16.67, 2) : 1; // Cap delta time, normalize to 60fps
      lastFrameTime = currentTime;

      // Keep dragged piece glued to cursor every frame (even if a move event was missed)
      if (dragging) {
        syncDragToPointer(dragging, lastPointerClient.x, lastPointerClient.y);
      }

    // Safety check before getBoundingClientRect
    let containerRect;
    try {
      containerRect = innerContainer.getBoundingClientRect();
    } catch (error) {
      console.warn('[PHYSICS] Error getting container bounds:', error);
      scheduleNextAnimationFrame();
      return;
    }
    
    if (!containerRect || containerRect.width === 0 || containerRect.height === 0) {
      scheduleNextAnimationFrame();
      return;
    }
    
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;
    
    // Update last known container size for resize detection
    lastContainerSize.width = containerWidth;
    lastContainerSize.height = containerHeight;

    // Clean up items with removed DOM elements
    items = items.filter(item => {
      if (!item || !item.el) return false;
      // CRITICAL FIX: Check if element has style property
      if (!item.el.style || typeof item.el.style !== 'object') return false;
      // Check if element is still in DOM
      try {
        if (!document.contains(item.el)) return false;
      } catch (e) {
        return false;
      }
      return true;
    });

    items.forEach(item => {
      // CRITICAL FIX: Check item, item.el, and item.el.style before accessing
      if (!item || !item.el) return;
      if (!item.el.style || typeof item.el.style !== 'object') return;
      if (item.dragging) return;

      let dropScale = 1;
      let dropRotationOffset = 0;
      if (item.dropping) {
        const dropElapsed = currentTime - item.dropStartTime;
        const dropDuration = 280;
        const dropProgress = Math.min(dropElapsed / dropDuration, 1);
        const eased = 1 - Math.pow(1 - dropProgress, 2);
        dropScale = 1.05 - (0.05 * eased);
        dropRotationOffset = Math.sin(dropProgress * Math.PI) * 1.5;
        if (dropProgress >= 1) {
          item.dropping = false;
          if (item.el && item.el.style) {
            item.el.style.filter = 'none';
          }
        }
      }

      // Physics simulation (gravity + fall after release)
      if (CONFIG && CONFIG.PHYSICS) {
        item.vy += CONFIG.PHYSICS.GRAVITY * deltaTime;
        
        // Apply friction
        item.vx *= Math.pow(CONFIG.PHYSICS.FRICTION, deltaTime);
        item.vy *= Math.pow(CONFIG.PHYSICS.FRICTION, deltaTime);
      }

      // Angular motion
      if (item.angularVelocity !== undefined) {
        item.angularVelocity *= Math.pow(0.98, deltaTime);
        item.rotation += item.angularVelocity * deltaTime;
        if (Math.abs(item.angularVelocity) < 0.003) item.angularVelocity = 0;
      }

      // Update position
      item.x += item.vx * deltaTime;
      item.y += item.vy * deltaTime;

      // Boundary collision with realistic bounce
      const halfW = item.width / 2;
      const halfH = item.height / 2;

      const bounce = (CONFIG && CONFIG.PHYSICS) ? CONFIG.PHYSICS.BOUNCE : 0.7;
      const minVelocity = (CONFIG && CONFIG.PHYSICS) ? CONFIG.PHYSICS.MIN_VELOCITY : 0.1;

      if (item.x - halfW < 0) {
        item.x = halfW;
        item.vx *= -bounce;
        if (item.angularVelocity !== undefined) {
          item.angularVelocity += (Math.random() - 0.5) * 0.15;
        }
      } else if (item.x + halfW > containerWidth) {
        item.x = containerWidth - halfW;
        item.vx *= -bounce;
        if (item.angularVelocity !== undefined) {
          item.angularVelocity += (Math.random() - 0.5) * 0.15;
        }
      }

      if (item.y - halfH < 0) {
        item.y = halfH;
        item.vy *= -bounce;
        if (item.angularVelocity !== undefined) {
          item.angularVelocity += (Math.random() - 0.5) * 0.15;
        }
      } else if (item.y + halfH > containerHeight) {
        item.y = containerHeight - halfH;
        item.vy *= -bounce;
        item.vx *= 0.92; // Ground friction
        if (item.angularVelocity !== undefined) {
          item.angularVelocity *= 0.85;
        }
      }

      // Stop tiny movements
      if (Math.abs(item.vx) < minVelocity) item.vx = 0;
      if (Math.abs(item.vy) < minVelocity) item.vy = 0;

      try {
        if (!item.el || !item.el.style) return;
        if (item.dragging || item.dragMountedToBody) return;

        const rotationDeg = ((item.rotation || 0) * 180 / Math.PI) + dropRotationOffset;
        const scale = item.dropping ? dropScale : 1;
        applyPhysicsTransform(item, scale);
        item.el.style.opacity = '1';
        item.el.style.visibility = 'visible';
        if (!item.dropping) {
          item.el.style.zIndex = '';
          item.el.style.filter = 'none';
        }
      } catch (error) {
        console.warn('[PHYSICS] Error updating transform:', error);
      }
    });

      scheduleNextAnimationFrame();
    } catch (error) {
      console.warn('[PHYSICS] Error in animate loop:', error);
      // Continue animation even if there's an error
      scheduleNextAnimationFrame();
    }
  }

  function onMouseMove(e) {
    if (!dragging || !dragging.el) return;

    if (typeof e.pointerId === 'number' && dragging.activePointerId != null && e.pointerId !== dragging.activePointerId) {
      return;
    }
    if (e.type === 'mousemove' && dragging.activePointerId != null) {
      return;
    }

    try {
      e.preventDefault();

      const pt = getPointerClientXY(e);
      lastPointerClient.x = pt.x;
      lastPointerClient.y = pt.y;
      syncDragToPointer(dragging, pt.x, pt.y);

      const currentTime = performance.now();
      dragHistory.push({ x: dragging.x, y: dragging.y, time: currentTime });
    
    // Keep last 8 positions
    if (dragHistory.length > 8) {
      dragHistory.shift();
    }
    
    // Remove old entries
    const cutoffTime = currentTime - 150;
    dragHistory = dragHistory.filter(entry => entry.time > cutoffTime);
    
      lastDragTime = currentTime;
    } catch (error) {
      console.warn('[PHYSICS] Error in onMouseMove:', error);
    }
  }

  function onMouseUp(e) {
    if (!dragging || !dragging.el) return;

    if (typeof e.pointerId === 'number' && dragging.activePointerId != null && e.pointerId !== dragging.activePointerId) {
      return;
    }
    if (e.type === 'mouseup' && dragging.activePointerId != null) {
      return;
    }

    try {
      if (typeof e.button === 'number' && e.button !== 0) return;

      releaseDragPointerCapture(dragging);

    // Calculate velocity from history
    let velocityX = 0;
    let velocityY = 0;

    if (dragHistory.length >= 2) {
      // Use recent velocities with weighting
      let totalWeight = 0;
      let weightedVx = 0;
      let weightedVy = 0;
      
      for (let i = dragHistory.length - 1; i > 0; i--) {
        const current = dragHistory[i];
        const previous = dragHistory[i - 1];
        const timeDelta = current.time - previous.time;
        
        if (timeDelta > 0 && timeDelta < 100) {
          const weight = 1 / (dragHistory.length - i + 1);
          const vx = (current.x - previous.x) / (timeDelta / 16.67);
          const vy = (current.y - previous.y) / (timeDelta / 16.67);
          
          weightedVx += vx * weight;
          weightedVy += vy * weight;
          totalWeight += weight;
        }
      }
      
      if (totalWeight > 0) {
        velocityX = weightedVx / totalWeight;
        velocityY = weightedVy / totalWeight;
      }
    }

    const released = dragging;

    const dragMultiplier = (CONFIG && CONFIG.PHYSICS && CONFIG.PHYSICS.DRAG_VELOCITY_MULTIPLIER)
      ? CONFIG.PHYSICS.DRAG_VELOCITY_MULTIPLIER
      : 0.35;
    released.vx = velocityX * dragMultiplier;
    released.vy = velocityY * dragMultiplier;

    // Always fall downward on release (gravity takes over)
    const gravity = (CONFIG && CONFIG.PHYSICS) ? CONFIG.PHYSICS.GRAVITY : 0.4;
    if (released.vy < gravity * 2) {
      released.vy = gravity * 3;
    }

    if (released.angularVelocity !== undefined) {
      const speed = Math.sqrt(released.vx * released.vx + released.vy * released.vy);
      const angle = Math.atan2(released.vy, released.vx);
      released.angularVelocity = Math.cos(angle + Math.PI / 2) * speed * 0.012 + (Math.random() - 0.5) * speed * 0.015;
    }

    released.dropping = true;
    released.dropStartTime = performance.now();

    unmountDragFromBody(released);
    applyPhysicsTransform(released, 1.05);
    released.dragInnerContainer = null;

    if (released.el && released.el.style) {
      released.el.style.cursor = 'grab';
      released.el.style.pointerEvents = 'auto';
      released.el.style.filter = 'drop-shadow(0 8px 16px rgba(0, 0, 0, 0.15))';
    }

    footerInView = true;
    if (!animating) {
      animating = true;
      lastFrameTime = performance.now();
      animate();
    }

    dragHistory = [];
    targetDragX = 0;
    targetDragY = 0;
    currentDragX = 0;
    currentDragY = 0;
    dragOffset = {x: 0, y: 0};

    released.dragging = false;
    dragging = null;
    } catch (error) {
      console.warn('[PHYSICS] Error in onMouseUp:', error);
      if (dragging) {
        dragging.dragging = false;
        dragging = null;
      }
    }
  }

  function cancelDrag() {
    if (!dragging) return;

    try {
      releaseDragPointerCapture(dragging);

      // CRITICAL FIX: Check dragging.el and dragging.el.style before accessing
      if (dragging.el && dragging.el.style) {
        dragging.vx = 0;
        dragging.vy = 0;
        if (dragging.angularVelocity !== undefined) {
          dragging.angularVelocity = 0;
        }

        unmountDragFromBody(dragging);
        applyPhysicsTransform(dragging, 1);

        dragging.el.style.cursor = 'grab';
        dragging.el.style.opacity = '1';
        dragging.el.style.zIndex = '';
        dragging.el.style.filter = 'none';
        dragging.el.style.pointerEvents = 'auto';
      }

      dragHistory = [];
      targetDragX = 0;
      targetDragY = 0;
      currentDragX = 0;
      currentDragY = 0;
      dragOffset = {x: 0, y: 0};

      dragging.dragInnerContainer = null;
      dragging.dragging = false;
      dragging = null;
    } catch (error) {
      console.warn('[PHYSICS] Error in cancelDrag:', error);
      dragging = null;
    }
  }

  // Event listeners - Cross-browser compatible
  try {
    // Mouse events (desktop browsers)
    window.addEventListener('mousemove', onMouseMove, {passive: false});
    window.addEventListener('mouseup', onMouseUp, {passive: false});

    if (typeof PointerEvent !== 'undefined') {
      window.addEventListener('pointermove', onMouseMove, {passive: false, capture: true});
      window.addEventListener('pointerup', onMouseUp, {passive: false, capture: true});
      window.addEventListener('pointercancel', cancelDrag, {passive: false, capture: true});
    }

    // Touch events (mobile browsers: iOS Safari, Chrome Mobile, etc.)
    window.addEventListener('touchmove', onMouseMove, {passive: false});
    window.addEventListener('touchend', onMouseUp, {passive: false});
    window.addEventListener('touchcancel', cancelDrag, {passive: false});
    
    // Window events
    window.addEventListener('blur', cancelDrag, {passive: false});
    
    // Resize handler for responsive behavior - works on all browsers
    window.addEventListener('resize', handleResize, {passive: true});
    window.addEventListener('orientationchange', () => {
      // Delay to allow orientation change to complete
      setTimeout(handleResize, 100);
    }, {passive: true});
    
    // Visual Viewport: only run layout work when dimensions change (not on every scroll)
    if (window.visualViewport) {
      const onVisualViewportChange = function() {
        const vv = window.visualViewport;
        if (!vv) {
          handleResize();
          return;
        }
        const w = Math.round(vv.width);
        const h = Math.round(vv.height);
        if (w !== lastVvWidth || h !== lastVvHeight) {
          lastVvWidth = w;
          lastVvHeight = h;
          handleResize();
        }
      };
      window.visualViewport.addEventListener('resize', onVisualViewportChange, {passive: true});
      window.visualViewport.addEventListener('scroll', onVisualViewportChange, {passive: true});
    }
  } catch (error) {
    console.warn('[PHYSICS] Error adding event listeners:', error);
  }

  // Register physics setup with safety checks
  try {
    if (typeof initManager !== 'undefined' && initManager) {
      if (typeof initManager.registerCritical === 'function') {
        initManager.registerCritical(setupPhysics, 'Footer Physics Setup');
      }
      if (typeof initManager.registerDeferred === 'function' && CONFIG && CONFIG.RETRY) {
        initManager.registerDeferred(setupPhysics, CONFIG.RETRY.SHORT, 'Footer Physics (deferred 1)');
        initManager.registerDeferred(setupPhysics, CONFIG.RETRY.MEDIUM, 'Footer Physics (deferred 2)');
        initManager.registerDeferred(setupPhysics, CONFIG.RETRY.LONG, 'Footer Physics (deferred 3)');
        initManager.registerDeferred(setupPhysics, CONFIG.RETRY.VERY_LONG, 'Footer Physics (deferred 4)');
        initManager.registerDeferred(setupPhysics, CONFIG.RETRY.EXTRA_LONG, 'Footer Physics (deferred 5)');
        initManager.registerDeferred(setupPhysics, CONFIG.RETRY.MAX, 'Footer Physics (deferred 6)');
      }
    }
  } catch (error) {
    console.warn('[PHYSICS] Error registering with initManager:', error);
    // Fallback: try to setup when DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setupPhysics);
    } else {
      setupPhysics();
    }
  }

  // Fallback initialization
  if (typeof onWindowLoad === 'function') {
    onWindowLoad(() => {
      if (!setupDone) {
        setupPhysics();
      }
    });
  } else {
    // Fallback if onWindowLoad is not available
    if (window.addEventListener) {
      window.addEventListener('load', () => {
        if (!setupDone) {
          setupPhysics();
        }
      });
    }
  }

  // Public API
  window.footerPhysics = {
    enableDragAndDrop: function() {
      setupPhysics();
    },
    getItems: function() {
      return items;
    },
    isDragging: function() {
      return dragging !== null;
    },
    cancelDrag: cancelDrag,
    fixSVGSizes: function() {
      // Find all physics-body elements and fix their SVG container sizes
      const footer = typeof safeQuerySelector === 'function' && typeof CONFIG !== 'undefined' 
        ? safeQuerySelector(CONFIG.SELECTORS.FOOTER) 
        : document.getElementById('footer');
      if (!footer) return;
      
      const physicsContainer = typeof safeQuerySelector === 'function' && typeof CONFIG !== 'undefined'
        ? safeQuerySelector(CONFIG.SELECTORS.PHYSICS_CONTAINER, footer)
        : footer.querySelector('[data-framer-name="Physics DSK"]');
      if (!physicsContainer) return;
      
      const innerContainer = physicsContainer.querySelector('div[draggable="false"]');
      if (!innerContainer) return;
      
      const footerElements = Array.from(footer.querySelectorAll('[id^="physics-body-footer"]'));
      const genericElements = Array.from(innerContainer.querySelectorAll('#physics-body'));
      const allElements = Array.from(new Set([...footerElements, ...genericElements]));
      
      fixSVGContainerSizes(allElements);
    }
  };

})();


