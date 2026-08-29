import { Test, TestingModule } from '@nestjs/testing';
import { GmailListenerController } from './email-poller.controller.ts';
import { EmailPollerService } from './email-poller.service.ts';

describe('GmailListenerController', () => {
  let gmailListenerController: GmailListenerController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [GmailListenerController],
      providers: [EmailPollerService],
    }).compile();

    gmailListenerController = app.get<GmailListenerController>(GmailListenerController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(gmailListenerController.getHello()).toBe('Hello World!');
    });
  });
});
