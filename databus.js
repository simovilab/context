import { createMachine } from "xstate";
export const machine = createMachine(
  {
    id: "Untitled",
    initial: "Initial state",
    states: {
      "Initial state": {
        on: {
          next: [
            {
              target: "Another state",
              actions: [],
              meta: {},
            },
          ],
        },
      },
      "Another state": {
        on: {
          next: [
            {
              target: "Parent state",
              guard: "some condition",
              actions: [],
              meta: {},
            },
            {
              target: "Initial state",
              actions: [],
              meta: {},
            },
          ],
        },
      },
      "Parent state": {
        initial: "Child state",
        states: {
          "Child state": {
            on: {
              next: [
                {
                  target: "Another child state",
                  actions: [],
                  meta: {},
                },
              ],
            },
          },
          "Another child state": {},
        },
        on: {
          back: [
            {
              target: "Initial state",
              actions: [
                {
                  type: "reset",
                },
              ],
              meta: {},
            },
          ],
        },
      },
    },
  },
  {
    actions: {
      reset: ({ context, event }) => {},
    },
    actors: {},
    guards: {
      "some condition": ({ context, event }, params) => {
        return false;
      },
    },
    delays: {},
  },
);
