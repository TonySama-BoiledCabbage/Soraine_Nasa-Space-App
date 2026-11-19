// Describes the implemented demonstration, not measured material properties.
// Keep this separate from the viewer so the object copy can be edited independently.
export const OBJECT_INFO = {
  flame: {
    title: 'Burner flame', kind: 'Heat source · mechanism demo', surface: 'Shader cone · colour shifts toward blue', role: 'Visual centre and heat source',
    intro: 'Every scene change starts at the flame. Its shape and colour follow the selected gravity setting.',
    action: 'Return to the scene and press O2 SUPPLY (or O) to add oxygen. Drag a worktop sample near the burner to expose it to heat.',
    observe: 'Switch gravity and compare: tall and flickering on Earth, lower and wider on Mars and the Moon, round and blue in orbit.',
    note: 'Schematic. Flame height, roundness and colour are visual parameters, not a validated combustion model. Fuel and oxygen are demonstration scales, not measured concentrations or temperatures.'
  },
  oil: {
    title: 'Oil dispenser', kind: 'Fuel delivery', surface: 'Tinted body · metal nozzle', role: 'Fuel source',
    intro: 'Follow the fuel from the bottle to the burner. This is the starting point of the fuel-delivery demonstration.',
    action: 'Return to the scene, then drag the bottle. It tips toward the burner and releases droplets from its nozzle.',
    observe: 'Switch the gravity setting and compare the droplet paths. The disturbance and fuel behaviour are illustrative.',
    note: 'The bottle finish is visual. The droplets are a simplified demonstration, not a measured oil or combustion experiment.'
  },
  board: {
    title: 'Cutting board', kind: 'Contact & motion', surface: 'Sanded maple appearance', role: 'Movable work surface',
    intro: 'A familiar surface makes small movements easy to notice. The board and the eggs are separate objects in the scene.',
    action: 'Return to the scene and drag the board. Watch how its contact with the counter affects its movement.',
    observe: 'Compare its response to the same scene disturbance under each gravity setting.',
    note: 'The wood texture shows appearance only. Friction and mass are illustrative estimates; wood flammability is not simulated.'
  },
  egg1: {
    title: 'Egg 01', kind: 'Contact & motion', surface: 'Eggshell appearance', role: 'Loose object',
    intro: 'A small object on the board gives you another way to see the change in motion.',
    action: 'Return to the scene, then drag or release the egg. It can move independently of the cutting board.',
    observe: 'Compare its movement with the second egg, keeping the selected gravity in mind.',
    note: 'The visible egg is elongated; its collision shape is a sphere. Rolling and bouncing are illustrative.'
  },
  egg2: {
    title: 'Egg 02', kind: 'Contact & motion', surface: 'Eggshell appearance', role: 'Loose object',
    intro: 'The second egg is an independent object, so the two eggs do not have to follow the same path.',
    action: 'Return to the scene, then move the egg or the board and watch their contact.',
    observe: 'Compare its response with the first egg as the scene disturbance reaches them.',
    note: 'The visible egg is elongated; its collision shape is a sphere. Rolling and bouncing are illustrative.'
  },
  mug: {
    title: 'Ceramic mug', kind: 'Contact & motion', surface: 'Glazed ceramic appearance', role: 'Loose container',
    intro: 'The hollow cup provides a familiar scale beside the smaller objects on the counter.',
    action: 'Return to the scene and drag the mug to move it independently of the other objects.',
    observe: 'Compare how it settles, tips or drifts after the scene disturbance under different gravity settings.',
    note: 'The mug is empty. Its collision shape is a simplified cylinder; liquid, fracture and thermal behaviour are not simulated.'
  },
  tomato: {
    title: 'Tomato', kind: 'Contact & motion', surface: 'Red skin appearance', role: 'Loose round object',
    intro: 'Its round shape gives you a different motion cue beside the flat cutting board and the taller mug.',
    action: 'Return to the scene, then drag and release the tomato on the worktop.',
    observe: 'Compare its movement with the board and eggs after changing the gravity setting.',
    note: 'This is a rigid sphere in the demonstration. Deformation, damage and cooking are not simulated.'
  },
  pan: {
    title: 'Frying pan', kind: 'Burner & cookware', surface: 'Metal exterior · dark handle', role: 'Movable cookware',
    intro: 'The pan sits above the burner, while the fried egg is a separate object inside it.',
    action: 'Return to the scene and drag the pan. The egg can move independently of the pan.',
    observe: 'Compare how the pan and egg respond to the scene disturbance as the gravity changes.',
    note: 'The finish is visual. Heat transfer, pan temperature and cooking are not calculated in this demonstration.'
  },
  friedEgg: {
    title: 'Fried egg', kind: 'Contact & motion', surface: 'Egg white · domed yolk', role: 'Loose object in the pan',
    intro: 'The egg has its own motion, so it can move relative to the pan around it.',
    action: 'Return to the scene and move the pan or the egg to observe their contact.',
    observe: 'Watch their relative motion after switching between the gravity settings.',
    note: 'The egg is a rigid visual model. Its shape, colour and texture do not change with temperature.'
  }
};
