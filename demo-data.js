(function(global) {
  function generateDemoPlannerEntries(referenceDate) {
    const baseDate = referenceDate ? new Date(referenceDate) : new Date();
    const today = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
    const year = today.getFullYear();
    const month = today.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const monthLength = new Date(year, month + 1, 0).getDate();

    const entries = [];

    const sampleTasks = [
      { type: 'task', title: 'Morning Run', startHour: 6, durationHours: 1, notes: 'Start the day energized.', priority: 'normal' },
      { type: 'task', title: 'Project Check-In', startHour: 10, durationHours: 1, notes: 'Sync with the design team.', priority: 'high' },
      { type: 'event', title: 'Lunch and Learn', startHour: 12, durationHours: 1, notes: 'Topic: Emerging tech trends.', priority: 'normal' },
      { type: 'task', title: 'Focus Block', startHour: 14, durationHours: 2, notes: 'Heads-down work time.', priority: 'high' },
      { type: 'task', title: 'Pickup from School', startHour: 16, durationHours: 1, notes: 'Coordinate carpool schedule.', priority: 'normal' },
      { type: 'event', title: 'Family Dinner', startHour: 18, durationHours: 2, notes: 'Cook together & share highlights.', priority: 'low' },
      { type: 'task', title: 'Reading Hour', startHour: 20, durationHours: 1, notes: 'Read 20 pages of current book.', priority: 'low' }
    ];

    const addEntry = ({ date, type, title, startHour = null, durationHours = null, notes, priority = 'normal' }) => {
      const startTime = startHour !== null ? `${String(startHour).padStart(2, '0')}:00` : '';
      const endHour = startHour !== null && durationHours != null ? Math.min(23, startHour + durationHours) : null;
      const endTime = endHour !== null ? `${String(endHour).padStart(2, '0')}:00` : '';

      entries.push({
        id: `demo_${date}_${title.replace(/\s+/g, '_')}_${entries.length}`,
        type,
        title,
        notes,
        priority,
        startDate: date,
        endDate: date,
        startTime,
        endTime,
        createdAt: new Date().toISOString()
      });
    };

    for (let day = 0; day < monthLength; day += 1) {
      const currentDate = new Date(firstOfMonth);
      currentDate.setDate(currentDate.getDate() + day);
      const yyyy = currentDate.getFullYear();
      const mm = String(currentDate.getMonth() + 1).padStart(2, '0');
      const dd = String(currentDate.getDate()).padStart(2, '0');
      const dateISO = `${yyyy}-${mm}-${dd}`;

      const dayEntries = [];

      dayEntries.push({
        type: 'task',
        title: 'Daily Planning',
        startHour: 7,
        durationHours: 1,
        notes: `Review goals for ${dateISO}.`,
        priority: 'normal'
      });

      const sample = sampleTasks[day % sampleTasks.length];
      dayEntries.push({
        ...sample,
        title: `${sample.title} (${mm}/${dd})`
      });

      if (day % 3 === 0) {
        dayEntries.push({
          type: 'event',
          title: `Team Standup (${mm}/${dd})`,
          startHour: 9,
          durationHours: 1,
          notes: 'Check progress and blockers.',
          priority: 'normal'
        });
      }

      if (day % 5 === 0) {
        dayEntries.push({
          type: 'event',
          title: `Community Volunteering (${mm}/${dd})`,
          startHour: 15,
          durationHours: 2,
          notes: 'Support local shelter activities.',
          priority: 'low'
        });
      }

      if (currentDate.getDay() === 0) {
        dayEntries.push({
          type: 'event',
          title: `Weekend Adventure (${mm}/${dd})`,
          startHour: 11,
          durationHours: 3,
          notes: 'Explore a nearby park with the family.',
          priority: 'low'
        });
      }

      dayEntries.forEach(entry => addEntry({ date: dateISO, ...entry }));
    }

    return entries;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { generateDemoPlannerEntries };
  }
  if (typeof global !== 'undefined') {
    global.generateDemoPlannerEntries = generateDemoPlannerEntries;
  }
})(typeof window !== 'undefined' ? window : globalThis);

