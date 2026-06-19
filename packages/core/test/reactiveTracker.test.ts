import { createReactiveTracker, signal } from '../src';

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
