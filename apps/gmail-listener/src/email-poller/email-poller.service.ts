import { Injectable } from '@nestjs/common';

@Injectable()
export class EmailPollerService {
  getHello(): string {
    return 'Hello World!';
  }
}
