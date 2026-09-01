import { BadRequestException, Injectable } from "@nestjs/common";
import { LedgerAccountType, LedgerDirection, Prisma } from "@prisma/client";

import { PrismaService } from "../../infra/prisma/prisma.service";
import { ledgerBalances } from "./fee-resolver";

export interface LedgerPosting {
  accountRef: string;
  accountType: LedgerAccountType;
  amountPoisha: bigint;
  direction: LedgerDirection;
  memo?: string;
}

@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async append(
    operationId: string,
    paymentId: string | null,
    entries: readonly LedgerPosting[],
    transaction?: Prisma.TransactionClient,
  ) {
    if (
      entries.length < 2 ||
      entries.some((entry) => entry.amountPoisha <= 0n) ||
      !ledgerBalances(entries)
    )
      throw new BadRequestException("Ledger operation must balance to zero.");

    const client = transaction ?? this.prisma;
    await client.ledgerEntry.createMany({
      data: entries.map((entry) => ({
        operation_id: operationId,
        payment_id: paymentId,
        account_type: entry.accountType,
        account_ref: entry.accountRef,
        direction: entry.direction,
        amount_poisha: entry.amountPoisha,
        memo: entry.memo,
      })),
    });
  }

  async reconciliation() {
    const totals = await this.prisma.ledgerEntry.groupBy({
      by: ["direction"],
      _sum: { amount_poisha: true },
    });
    const debit =
      totals.find((item) => item.direction === LedgerDirection.DEBIT)?._sum
        .amount_poisha ?? 0n;
    const credit =
      totals.find((item) => item.direction === LedgerDirection.CREDIT)?._sum
        .amount_poisha ?? 0n;
    return {
      balanced: debit === credit,
      creditPoisha: credit,
      debitPoisha: debit,
    };
  }
}
