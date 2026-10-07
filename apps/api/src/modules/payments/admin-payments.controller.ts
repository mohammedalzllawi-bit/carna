import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PaymentStatus } from "@prisma/client";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { toLyd, toMilli } from "../../common/money";
import { PrismaService } from "../../prisma/prisma.service";
import { AdminKeyGuard } from "../catalog/admin-key.guard";
import { AuthenticatedRequest } from "../auth/auth.types";
import { PaymentsService } from "./payments.service";

class PaymentQueryDto {
  @IsOptional() @IsEnum(PaymentStatus) status?: PaymentStatus;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10000) page = 1;
}

const moneyPattern = /^\d{1,12}(?:\.\d{1,3})?$/;

class ProviderStateDto {
  @IsBoolean() active!: boolean;
}

class SaveProviderDefinitionDto {
  @IsString() @Matches(/^[a-z][a-z0-9-]{2,60}$/) code!: string;
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) envVariables!: string[];
  @IsOptional() @IsString() @Matches(moneyPattern) minimumRechargeLyd?: string;
  @IsOptional() @IsString() @Matches(moneyPattern) maximumRechargeLyd?: string;
  @IsOptional() @IsString() @Matches(moneyPattern) fixedFeeLyd?: string;
  @IsOptional() @Type(() => Number) @Min(0) @Max(100) percentageFee?: number;
  @IsBoolean() active!: boolean;
}

class SaveFeeDto {
  @IsString() @Matches(/^[a-z][a-z0-9._-]{2,79}$/) code!: string;
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsIn(["Fixed", "Percentage"]) calculation!: "Fixed" | "Percentage";
  @IsOptional() @IsString() @Matches(moneyPattern) amountLyd?: string;
  @IsOptional() @Type(() => Number) @Min(0) @Max(100) rate?: number;
  @IsOptional() @IsString() @Matches(moneyPattern) minimumLyd?: string;
  @IsOptional() @IsString() @Matches(moneyPattern) maximumLyd?: string;
  @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) planIds!: string[];
  @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) userIds!: string[];
  @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) dealerIds!: string[];
  @IsBoolean() isActive!: boolean;
}

@ApiTags("Admin Payments")
@ApiBearerAuth()
@UseGuards(AdminKeyGuard)
@Controller({ path: "admin/payments", version: "1" })
export class AdminPaymentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
  ) {}

  @Get()
  async list(@Query() query: PaymentQueryDto) {
    const where = query.status ? { status: query.status } : {};
    const [payments, total, statuses] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip: (query.page - 1) * 30,
        take: 30,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        include: {
          user: { select: { fullName: true } },
          order: { select: { type: true, status: true, expiresAt: true } },
        },
      }),
      this.prisma.payment.count({ where }),
      this.prisma.payment.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);
    return {
      page: query.page,
      pageSize: 30,
      total,
      counts: Object.fromEntries(
        statuses.map((item) => [item.status, item._count._all]),
      ),
      items: payments.map((payment) => ({
        id: payment.id,
        orderId: payment.orderId,
        userName: payment.user.fullName,
        status: payment.status,
        amountLyd: toLyd(payment.amount),
        currency: payment.currency,
        provider: payment.provider,
        createdAt: payment.createdAt,
        order: payment.order,
      })),
    };
  }

  @Get("providers")
  providers() {
    return this.payments.listProvidersAdmin();
  }

  @Post("providers")
  saveProvider(@Body() input: SaveProviderDefinitionDto, @Req() req: AuthenticatedRequest) {
    return this.payments.saveProviderDefinition(input, req.user.id);
  }

  @Patch("providers/:code")
  provider(
    @Param("code") code: string,
    @Body() input: ProviderStateDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.payments.setProviderActive(code, input.active, req.user.id);
  }

  @Get("fees")
  async fees() {
    const fees = await this.prisma.fee.findMany({
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    });
    return fees.map((fee) => this.serializeFee(fee));
  }

  @Post("fees")
  createFee(@Body() input: SaveFeeDto, @Req() req: AuthenticatedRequest) {
    return this.saveFee(null, input, req.user.id);
  }

  @Patch("fees/:id")
  updateFee(
    @Param("id") id: string,
    @Body() input: SaveFeeDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.saveFee(id, input, req.user.id);
  }

  @Delete("fees/:id")
  async archiveFee(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    const before = await this.prisma.fee.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("fee.not_found");
    const fee = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.fee.update({
        where: { id },
        data: { isActive: false },
      });
      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: "admin.fee.archived",
          entityType: "Fee",
          entityId: id,
          before: { isActive: before.isActive },
          after: { isActive: false },
        },
      });
      return saved;
    });
    return this.serializeFee(fee);
  }

  @Get(":id")
  async detail(@Param("id") id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        order: true,
        transactions: { orderBy: { createdAt: "desc" }, take: 100 },
      },
    });
    if (!payment) throw new NotFoundException("payment.not_found");
    const ledger = await this.prisma.walletLedger.findMany({
      where: { referenceId: payment.id, userId: payment.userId },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
    return {
      id: payment.id,
      status: payment.status,
      provider: payment.provider,
      currency: payment.currency,
      amountLyd: toLyd(payment.amount),
      providerTransactionId: payment.providerTransactionId,
      order: {
        id: payment.orderId,
        type: payment.order.type,
        status: payment.order.status,
        expiresAt: payment.order.expiresAt,
      },
      transactions: payment.transactions.map((entry) => ({
        id: entry.id,
        status: entry.status,
        amountLyd: toLyd(entry.amount),
        currency: entry.currency,
        providerEventId: entry.providerEventId,
        webhookVerified: entry.webhookVerified,
        createdAt: entry.createdAt,
        reviewRequired:
          (entry.rawResponse as { disposition?: string } | null)
            ?.disposition === "late_payment_review",
      })),
      ledger: ledger.map((entry) => ({
        id: entry.id,
        type: entry.type,
        direction: entry.direction,
        amountLyd: toLyd(entry.amount),
        currency: entry.currency,
        createdAt: entry.createdAt,
      })),
    };
  }

  private async saveFee(id: string | null, input: SaveFeeDto, actorId: string) {
    if (input.calculation === "Fixed" && !input.amountLyd)
      throw new BadRequestException("fee.amount_required");
    if (input.calculation === "Percentage" && input.rate === undefined)
      throw new BadRequestException("fee.rate_required");
    if (
      input.minimumLyd &&
      input.maximumLyd &&
      toMilli(input.minimumLyd) > toMilli(input.maximumLyd)
    ) {
      throw new BadRequestException("fee.invalid_range");
    }
    const before = id
      ? await this.prisma.fee.findUnique({ where: { id } })
      : null;
    if (id && !before) throw new NotFoundException("fee.not_found");
    const data = {
      code: input.code,
      name: input.name.trim(),
      amount: input.calculation === "Fixed" ? toMilli(input.amountLyd!) : null,
      rate: input.calculation === "Percentage" ? input.rate! : null,
      currency: "LYD",
      isActive: input.isActive,
      rules: {
        calculation: input.calculation,
        minimumMilli: input.minimumLyd
          ? toMilli(input.minimumLyd).toString()
          : null,
        maximumMilli: input.maximumLyd
          ? toMilli(input.maximumLyd).toString()
          : null,
        planIds: [...new Set(input.planIds)],
        userIds: [...new Set(input.userIds)],
        dealerIds: [...new Set(input.dealerIds)],
      },
    };
    const saved = await this.prisma.$transaction(async (tx) => {
      const fee = id
        ? await tx.fee.update({ where: { id }, data })
        : await tx.fee.create({ data });
      await tx.auditLog.create({
        data: {
          actorId,
          action: id ? "admin.fee.updated" : "admin.fee.created",
          entityType: "Fee",
          entityId: fee.id,
          before: before
            ? { code: before.code, isActive: before.isActive }
            : undefined,
          after: {
            code: fee.code,
            isActive: fee.isActive,
            calculation: input.calculation,
          },
        },
      });
      return fee;
    });
    return this.serializeFee(saved);
  }

  private serializeFee(fee: {
    id: string;
    code: string;
    name: string;
    amount: bigint | null;
    rate: number | null;
    currency: string;
    isActive: boolean;
    rules: unknown;
  }) {
    const rules =
      fee.rules && typeof fee.rules === "object" && !Array.isArray(fee.rules)
        ? (fee.rules as Record<string, unknown>)
        : {};
    const milli = (value: unknown) =>
      typeof value === "string" ? toLyd(BigInt(value)) : null;
    return {
      id: fee.id,
      code: fee.code,
      name: fee.name,
      amountLyd: fee.amount === null ? null : toLyd(fee.amount),
      rate: fee.rate,
      currency: fee.currency,
      isActive: fee.isActive,
      calculation:
        rules.calculation ?? (fee.amount === null ? "Percentage" : "Fixed"),
      minimumLyd: milli(rules.minimumMilli),
      maximumLyd: milli(rules.maximumMilli),
      planIds: Array.isArray(rules.planIds) ? rules.planIds : [],
      userIds: Array.isArray(rules.userIds) ? rules.userIds : [],
      dealerIds: Array.isArray(rules.dealerIds) ? rules.dealerIds : [],
    };
  }
}
