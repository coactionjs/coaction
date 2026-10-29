import { signal } from '../src';
import { createReactiveTracker } from '../src/reactiveTracker';

test('reactive tracker notifies only tracked signal dependencies', () => {
  const count = signal(0);
  const label = signal('one');
  const tracker = createReactiveTracker();
  const notifications: number[] = [];

  tracker.subscribe(() => {
    notifications.push(tracker.getSnapshot());
  });
  expect(tracker.track(() => count())).toBe(0);

  label('two');
  expect(notifications).toEqual([]);

  count(1);
  expect(notifications).toEqual([1]);

  tracker.track(() => label());
  count(2);
  expect(notifications).toEqual([1]);

  label('three');
  expect(notifications).toEqual([1, 2]);
});

test('reactive tracker dispose removes tracked dependencies', () => {
  const count = signal(0);
  const tracker = createReactiveTracker();
  const notifications: number[] = [];

  tracker.subscribe(() => {
    notifications.push(tracker.getSnapshot());
  });
  tracker.track(() => count());
  tracker.dispose();

  count(1);
  expect(notifications).toEqual([]);
});

test('reactive tracker unsubscribe stops listener but preserves dependencies', () => {
  const count = signal(0);
  const tracker = createReactiveTracker();
  const notifications: number[] = [];

  const unsubscribe = tracker.subscribe(() => {
    notifications.push(tracker.getSnapshot());
  });
  tracker.track(() => count());
  unsubscribe();
  expect(notifications).toEqual([]);

  const secondNotifications: number[] = [];
  tracker.subscribe(() => {
    secondNotifications.push(tracker.getSnapshot());
  });

  count(1);
  expect(secondNotifications).toEqual([1]);
});

test('reactive tracker re-tracked in another order keeps every dependency', () => {
  const first = signal(0);
  const second = signal(0);
  const tracker = createReactiveTracker();
  const notifications: number[] = [];

  tracker.subscribe(() => {
    notifications.push(tracker.getSnapshot());
  });
  tracker.track(() => first() + second());
  // Nothing runs in between, so alien-signals is still in the same cycle.
  tracker.track(() => second() + first());

  second(1);
  expect(notifications).toEqual([1]);
  first(1);
  expect(notifications).toEqual([1, 2]);
});
