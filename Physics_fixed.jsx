import { jsx as _jsx } from "react/jsx-runtime";
import { addPropertyControls, ControlType } from "framer";
import Matter from "matter-js";
import React from "react";
import { makeBodies } from "https://framer.com/m/MakeBodies-Lkv1.js@LTuIQWugGJr30ZUS1CV9";
import { makeWalls } from "https://framer.com/m/MakeWalls-36kf.js@Ok6wam0uM9G4VUuXWgpR";

/**
 * These annotations control how your component sizes
 * Learn more: https://www.framer.com/docs/guides/auto-sizing
 *
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight any-prefer-fixed
 */
export default function Physics(props) {
  const containerRef = React.useRef(null);
  const engineRef = React.useRef(null);
  const renderRef = React.useRef(null);
  const mouseConstraintRef = React.useRef(null);
  const animationFrameRef = React.useRef(null);
  const stackRef = React.useRef(null);

  React.useEffect(() => {
    if (!containerRef.current) return;

    // Create engine if it doesn't exist
    if (!engineRef.current) {
      engineRef.current = Matter.Engine.create({
        enableSleeping: props.sleeping,
        gravity: { y: props.gravY, x: props.gravX }
      });

      const containerBounding = containerRef.current.getBoundingClientRect();
      makeWalls(containerBounding, engineRef.current.world, props.wallOptions);

      if (props.debug) {
        renderRef.current = Matter.Render.create({
          element: containerRef.current,
          engine: engineRef.current,
          options: {
            height: containerBounding.height,
            width: containerBounding.width,
            showAngleIndicator: true,
            showVelocity: true
          }
        });
        Matter.Render.run(renderRef.current);
      }

      // Pointer-friendly MouseConstraint (mouse + touch)
      if (props.mouseOptions.enable) {
        const mouse = Matter.Mouse.create(containerRef.current);
        mouseConstraintRef.current = Matter.MouseConstraint.create(engineRef.current, {
          mouse,
          constraint: {
            stiffness: props.mouseOptions.stiffness,
            render: { visible: false }
          }
        });
        Matter.Composite.add(engineRef.current.world, mouseConstraintRef.current);

        // En desktop: desactivar sólo la rueda (ok)
        mouseConstraintRef.current.mouse.element.removeEventListener("mousewheel", mouseConstraintRef.current.mouse.mousewheel);
        mouseConstraintRef.current.mouse.element.removeEventListener("DOMMouseScroll", mouseConstraintRef.current.mouse.mousewheel);

        // ✅ IMPORTANTE: NO quitar touchstart/move/end.
        // En su lugar, si querés preservar scroll cuando NO estás arrastrando,
        // sólo reenviamos "move" cuando hay un body agarrado:
        const moveIfGrabbed = handler => e => {
          if (mouseConstraintRef.current && mouseConstraintRef.current.body) {
            handler(e);
          }
        };
        mouseConstraintRef.current.mouse.element.addEventListener("mousemove", moveIfGrabbed(mouseConstraintRef.current.mouse.mousemove));

        // En mobile, además prevenimos el scroll SÓLO mientras hay dragueo:
        const preventScrollIfDragging = e => {
          if (mouseConstraintRef.current && mouseConstraintRef.current.body) {
            e.preventDefault();
          }
        };
        mouseConstraintRef.current.mouse.element.addEventListener("touchmove", moveIfGrabbed(mouseConstraintRef.current.mouse.mousemove), { passive: false });
        mouseConstraintRef.current.mouse.element.addEventListener("touchmove", preventScrollIfDragging, { passive: false });
      }

      stackRef.current = makeBodies(
        containerRef.current,
        engineRef.current.world,
        containerRef.current.children,
        props.frictionOptions,
        props.densityOptions
      );
    }

    // Animation loop
    function update() {
      if (!engineRef.current || !containerRef.current || !stackRef.current) return;

      animationFrameRef.current = requestAnimationFrame(update);

      stackRef.current.bodies.forEach((block, i) => {
        if (i >= containerRef.current.children.length) return;
        
        const el = containerRef.current.children[i];
        if (!el) return;

        const { x, y } = block.vertices[0];
        if (el.style) {
          el.style.visibility = "visible";
          el.style.top = `${y}px`;
          el.style.left = `${x}px`;
          el.style.transform = `
            translate(-50%, -50%)
            rotate(${block.angle}rad)
            translate(50%, 50%)
          `;
        }
      });

      Matter.Engine.update(engineRef.current);
    }

    update();

    // Cleanup function
    return () => {
      // Cancel animation frame
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      // Stop render if it exists
      if (renderRef.current) {
        Matter.Render.stop(renderRef.current);
        renderRef.current.element.remove();
        renderRef.current = null;
      }

      // Clean up mouse constraint
      if (mouseConstraintRef.current) {
        const mouseEl = mouseConstraintRef.current.mouse.element;
        if (mouseEl) {
          mouseEl.removeEventListener("mousemove", mouseConstraintRef.current.mouse.mousemove);
          mouseEl.removeEventListener("touchmove", mouseConstraintRef.current.mouse.mousemove);
        }
        Matter.Composite.remove(engineRef.current.world, mouseConstraintRef.current);
        mouseConstraintRef.current = null;
      }

      // Clean up engine
      if (engineRef.current) {
        Matter.Engine.clear(engineRef.current);
        engineRef.current = null;
      }

      stackRef.current = null;
    };
  }, [props.sleeping, props.gravY, props.gravX, props.debug, props.wallOptions, props.mouseOptions, props.frictionOptions, props.densityOptions]);

  return /*#__PURE__*/_jsx("div", {
    style: containerStyle,
    ref: containerRef,
    draggable: "false",
    onDragStart: e => {
      e.preventDefault();
    },
    children: props.children?.length > 0
      ? props.children.map((el, i) => {
          return /*#__PURE__*/_jsx("div", {
            style: bodyStyle,
            id: "physics-body",
            draggable: "false",
            children: el
          }, i);
        })
      : /*#__PURE__*/_jsx("div", {
          style: bodyStyle,
          id: "physics-body",
          draggable: "false",
          children: props.children
        })
  });
}

const containerStyle = {
  height: "100%",
  width: "100%",
  overflow: "hidden"
};

const bodyStyle = {
  position: "absolute",
  visibility: "hidden",
  touchAction: "none",
  WebkitUserSelect: "none",
  userSelect: "none",
  overscrollBehavior: "contain"
};

Physics.defaultProps = {
  gravX: 0,
  gravY: 1,
  children: [],
  wallOptions: {
    top: true,
    bottom: true,
    right: true,
    left: true
  },
  frictionOptions: {
    friction: 0.1,
    frictionAir: 0.01
  },
  mouseOptions: {
    angularStiffness: 0,
    stiffness: 0.2,
    enable: true
  },
  densityOptions: {
    enable: true,
    density: 0.001
  },
  sleeping: false
};

addPropertyControls(Physics, {
  children: {
    type: ControlType.Array,
    control: {
      type: ControlType.ComponentInstance
    }
  },
  gravY: {
    type: ControlType.Number,
    defaultValue: 1,
    max: 5,
    min: -5,
    step: 0.25,
    title: "Gravity Y"
  },
  gravX: {
    type: ControlType.Number,
    defaultValue: 0,
    max: 5,
    min: -5,
    step: 0.25,
    title: "Gravity X"
  },
  wallOptions: {
    title: "Walls",
    type: ControlType.Object,
    controls: {
      top: {
        type: ControlType.Boolean,
        defaultValue: true
      },
      bottom: {
        type: ControlType.Boolean,
        defaultValue: true
      },
      right: {
        type: ControlType.Boolean,
        defaultValue: true
      },
      left: {
        type: ControlType.Boolean,
        defaultValue: true
      }
    }
  },
  mouseOptions: {
    title: "Mouse",
    type: ControlType.Object,
    controls: {
      enable: {
        title: "Enable",
        type: ControlType.Boolean,
        defaultValue: true
      },
      angularStiffness: {
        title: "Angular stiffness",
        description: "A value of 0 allows objects to swing when held by the mouse",
        type: ControlType.Number,
        defaultValue: 0,
        min: 0,
        max: 1,
        step: 0.01
      },
      stiffness: {
        title: "Stiffness",
        description: "Click + drag creates a moving constraint (spring) that follows the mouse. This describes the stiffness of that spring",
        type: ControlType.Number,
        defaultValue: 0.2,
        min: 0.001,
        max: 1,
        step: 0.01
      }
    }
  },
  friction: {
    type: ControlType.Object,
    controls: {
      friction: {
        title: "Body friction",
        type: ControlType.Number,
        min: 0,
        max: 1,
        defaultValue: 0.1,
        step: 0.01
      },
      frictionAir: {
        title: "Air friction",
        type: ControlType.Number,
        min: 0,
        max: 1,
        defaultValue: 0.01,
        step: 0.01
      }
    }
  },
  densityOptions: {
    title: "Density",
    type: ControlType.Object,
    controls: {
      enable: {
        type: ControlType.Boolean,
        defaultValue: true,
        description: "Enabling density will cause mass to be calculated based on width and height"
      },
      density: {
        type: ControlType.Number,
        defaultValue: 0.001,
        min: 0.001,
        max: 1,
        step: 0.01
      }
    }
  },
  sleeping: {
    title: "Sleeping",
    description: "Improves performance at the cost of simulation accuracy",
    type: ControlType.Boolean,
    defaultValue: false
  }
});

export const __FramerMetadata__ = {
  "exports": {
    "default": {
      "type": "reactComponent",
      "name": "Physics",
      "slots": [],
      "annotations": {
        "framerSupportedLayoutWidth": "any-prefer-fixed",
        "framerContractVersion": "1",
        "framerSupportedLayoutHeight": "any-prefer-fixed"
      }
    },
    "__FramerMetadata__": {
      "type": "variable"
    }
  }
};
//# sourceMappingURL=./Physics_1.map

