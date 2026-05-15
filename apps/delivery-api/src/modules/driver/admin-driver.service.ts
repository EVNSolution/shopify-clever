import type {
  AdminDriverRow,
  CreatePendingDriverInput,
  CreatePendingDriverRecordInput,
  ListAdminDriversInput,
  RegenerateInviteCodeInput
} from './admin-driver.types.js';

export type AdminDriverRepository = {
  createPendingDriver(input: CreatePendingDriverRecordInput): Promise<AdminDriverRow>;
  listDrivers(input: ListAdminDriversInput): Promise<AdminDriverRow[]>;
  regenerateInviteCode(input: RegenerateInviteCodeInput): Promise<AdminDriverRow>;
};

export class AdminDriverService {
  constructor(private readonly repository: AdminDriverRepository) {}

  createPendingDriver(input: CreatePendingDriverInput): Promise<AdminDriverRow> {
    void input.createdBy;
    void input.inviteLink;
    void input.source;
    return this.repository.createPendingDriver({
      displayName: input.displayName,
      phone: input.phone,
      shopDomain: input.shopDomain
    });
  }

  listDrivers(input: ListAdminDriversInput): Promise<AdminDriverRow[]> {
    return this.repository.listDrivers(input);
  }

  regenerateInviteCode(input: RegenerateInviteCodeInput): Promise<AdminDriverRow> {
    return this.repository.regenerateInviteCode(input);
  }
}
