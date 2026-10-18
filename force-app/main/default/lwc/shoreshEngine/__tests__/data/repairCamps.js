/**
 * Two camps where the minimum repair's leniency (leaving a cell for never-blank) made the week
 * worse than building without it, kept as fixed data (ADR 0010). camp166 came from the
 * coordinator's reviewer's random camps (seed 166), camp93 from a probe of 1,500 random camps.
 * Synthetic data only.
 */
export const camp166 = {
  groups: [
    {
      id: "g0",
      name: "Bunk g0",
      division: "d1",
      availability: "AllDay"
    },
    {
      id: "g1",
      name: "Bunk g1",
      division: "d1",
      availability: "AllDay"
    },
    {
      id: "g2",
      name: "Bunk g2",
      division: "d1",
      availability: "AfternoonOnly"
    },
    {
      id: "g3",
      name: "Bunk g3",
      division: "d1",
      availability: "AllDay"
    },
    {
      id: "g4",
      name: "Bunk g4",
      division: "d2",
      availability: "AllDay"
    },
    {
      id: "g5",
      name: "Bunk g5",
      division: "d1",
      availability: "AfternoonOnly"
    },
    {
      id: "g6",
      name: "Bunk g6",
      division: "d2",
      availability: "AfternoonOnly"
    }
  ],
  blocks: [
    {
      id: "b0",
      name: "Period 1",
      startTime: "08:00",
      endTime: "08:45",
      partOfDay: "Morning"
    },
    {
      id: "b1",
      name: "Period 2",
      startTime: "09:00",
      endTime: "09:45",
      partOfDay: "Morning"
    },
    {
      id: "ox",
      name: "Ov",
      startTime: "09:30",
      endTime: "10:15",
      partOfDay: "Morning"
    },
    {
      id: "b2",
      name: "Period 3",
      startTime: "10:00",
      endTime: "10:45",
      partOfDay: "Morning"
    },
    {
      id: "b3",
      name: "Period 4",
      startTime: "11:00",
      endTime: "11:45",
      partOfDay: "Morning"
    },
    {
      id: "b4",
      name: "Period 5",
      startTime: "12:00",
      endTime: "12:45",
      partOfDay: "Afternoon"
    }
  ],
  days: 3,
  activities: [
    {
      id: "a0",
      name: "a0",
      min: 2,
      max: 4,
      span: 3,
      atOnce: 1,
      location: null,
      sameDivision: false,
      priority: "Low",
      early: null,
      eligible: []
    },
    {
      id: "a1",
      name: "a1",
      min: 2,
      max: null,
      span: 1,
      atOnce: null,
      location: "L0",
      sameDivision: false,
      priority: "High",
      early: null,
      eligible: []
    },
    {
      id: "a2",
      name: "a2",
      min: 2,
      max: 3,
      span: 1,
      atOnce: 2,
      location: null,
      sameDivision: false,
      priority: "High",
      early: null,
      eligible: []
    },
    {
      id: "a3",
      name: "a3",
      min: 2,
      max: 2,
      span: 2,
      atOnce: 3,
      location: null,
      sameDivision: false,
      priority: "Low",
      early: null,
      eligible: []
    },
    {
      id: "a4",
      name: "a4",
      min: 0,
      max: 2,
      span: 1,
      atOnce: 2,
      location: null,
      sameDivision: false,
      priority: "High",
      early: null,
      eligible: ["g0"]
    },
    {
      id: "a5",
      name: "a5",
      min: 1,
      max: 3,
      span: 1,
      atOnce: 1,
      location: null,
      sameDivision: false,
      priority: "Low",
      early: {
        count: 1,
        day: "Wednesday"
      },
      eligible: []
    },
    {
      id: "a6",
      name: "a6",
      min: 3,
      max: 3,
      span: 1,
      atOnce: 2,
      location: "L0",
      sameDivision: false,
      priority: "High",
      early: null,
      eligible: []
    },
    {
      id: "a7",
      name: "a7",
      min: 1,
      max: 2,
      span: 1,
      atOnce: 2,
      location: "L0",
      sameDivision: false,
      priority: "High",
      early: null,
      eligible: []
    }
  ],
  locations: [
    {
      id: "L0",
      fit: 2
    }
  ],
  fixed: [],
  recurring: [],
  otherPrograms: [
    {
      date: "2026-07-06",
      startTime: "10:00",
      endTime: "10:45",
      locationId: "L0",
      activityId: null,
      groups: 0
    },
    {
      date: "2026-07-08",
      startTime: "09:00",
      endTime: "09:45",
      locationId: "L0",
      activityId: "a1",
      groups: null
    }
  ],
  programId: "P1",
  weekId: "W2",
  option: 7,
  mode: "full"
};

export const camp93 = {
  groups: [
    {
      id: "g0",
      name: "Bunk g0",
      division: "div1",
      availability: "AllDay"
    },
    {
      id: "g1",
      name: "Bunk g1",
      division: "div1",
      availability: "AllDay"
    },
    {
      id: "g2",
      name: "Bunk g2",
      division: "div1",
      availability: "AllDay"
    },
    {
      id: "g3",
      name: "Bunk g3",
      division: "div1",
      availability: "AllDay"
    },
    {
      id: "g4",
      name: "Bunk g4",
      division: "div1",
      availability: "AllDay"
    },
    {
      id: "g5",
      name: "Bunk g5",
      division: "div1",
      availability: "AllDay"
    },
    {
      id: "g6",
      name: "Bunk g6",
      division: "div1",
      availability: "AllDay"
    }
  ],
  days: 2,
  blocks: [
    {
      id: "b0",
      name: "Period 1",
      startTime: "08:00",
      endTime: "08:45",
      partOfDay: "Morning"
    },
    {
      id: "b1",
      name: "Period 2",
      startTime: "09:00",
      endTime: "09:45",
      partOfDay: "Morning"
    },
    {
      id: "b2",
      name: "Period 3",
      startTime: "10:00",
      endTime: "10:45",
      partOfDay: "Morning"
    },
    {
      id: "b3",
      name: "Period 4",
      startTime: "11:00",
      endTime: "11:45",
      partOfDay: "Morning"
    }
  ],
  activities: [
    {
      id: "a0",
      name: "a0",
      min: 0,
      max: 2,
      span: 2,
      atOnce: 2,
      location: null,
      sameDivision: false,
      priority: "Low",
      early: null,
      eligible: []
    },
    {
      id: "a1",
      name: "a1",
      min: 1,
      max: 1,
      span: 1,
      atOnce: 1,
      location: null,
      sameDivision: false,
      priority: "High",
      early: null,
      eligible: []
    },
    {
      id: "a2",
      name: "a2",
      min: 2,
      max: 2,
      span: 1,
      atOnce: 2,
      location: null,
      sameDivision: false,
      priority: "Low",
      early: null,
      eligible: []
    },
    {
      id: "a3",
      name: "a3",
      min: 0,
      max: 1,
      span: 1,
      atOnce: 1,
      location: null,
      sameDivision: false,
      priority: "Low",
      early: null,
      eligible: []
    },
    {
      id: "a4",
      name: "a4",
      min: 0,
      max: 2,
      span: 1,
      atOnce: 1,
      location: null,
      sameDivision: false,
      priority: "Low",
      early: null,
      eligible: []
    },
    {
      id: "a5",
      name: "a5",
      min: 1,
      max: 2,
      span: 1,
      atOnce: 1,
      location: null,
      sameDivision: false,
      priority: "High",
      early: null,
      eligible: []
    }
  ],
  option: 7
};
