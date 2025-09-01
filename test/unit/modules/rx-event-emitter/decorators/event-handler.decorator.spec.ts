import 'reflect-metadata';
import { EventHandler } from '@src/index';
import { EVENT_HANDLER_METADATA, EVENT_HANDLER_OPTIONS } from '@src/modules/rx-event-emitter/interfaces';

describe('EventHandler Decorator', () => {
  class TestService {
    @EventHandler('test.event', { priority: 5 })
    handleTestEvent() {
      return 'ok';
    }

    @EventHandler('test.event.default')
    handleDefaultOptions() {
      return 'default';
    }

    // No decorator here
    noHandler() {
      return 'noop';
    }
  }

  it('should attach event name metadata to the handler method', () => {
    const metadata = Reflect.getMetadata(EVENT_HANDLER_METADATA, TestService.prototype.handleTestEvent);
    expect(metadata).toBe('test.event');
  });

  it('should attach handler options metadata to the handler method', () => {
    const metadata = Reflect.getMetadata(EVENT_HANDLER_OPTIONS, TestService.prototype.handleTestEvent);
    expect(metadata).toEqual({ priority: 5 });
  });

  it('should default options to empty object when none provided', () => {
    const metadata = Reflect.getMetadata(EVENT_HANDLER_OPTIONS, TestService.prototype.handleDefaultOptions);
    expect(metadata).toEqual({});
  });

  it('should not attach metadata to undecorated methods', () => {
    const eventMeta = Reflect.getMetadata(EVENT_HANDLER_METADATA, TestService.prototype.noHandler);
    const optionsMeta = Reflect.getMetadata(EVENT_HANDLER_OPTIONS, TestService.prototype.noHandler);

    expect(eventMeta).toBeUndefined();
    expect(optionsMeta).toBeUndefined();
  });
});
