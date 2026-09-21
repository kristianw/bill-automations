import {Injectable} from "@nestjs/common";

@Injectable()
export class EmailPollingController {
  async syncOnce(): Promise<{ processed: number }> {
    const ids = await this.gmail.listPending();
    for (const id of ids) { ... }
    return { processed: ids.length };
  }
}
