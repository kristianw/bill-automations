import {Injectable} from "@nestjs/common";

@Injectable()
export class BillSyncService {
  async syncOnce(): Promise<{ processed: number }> {
    const ids = await this.gmail.listPending();
    for (const id of ids) {
      // TODO
    }
    return { processed: ids.length };
  }
}
