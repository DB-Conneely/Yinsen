import { z } from "zod";
import { AppError } from "../errors";
import { resourceId } from "../projects/validation";

const minor = z.number().int().min(0).max(2147483647);
// Pinned Node 22.21.1 currency set: server/browser ICU versions must render and validate the same options.
export const invoiceCurrencies =
  "AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BRL BSD BTN BWP BYN BZD CAD CDF CHF CLP CNY COP CRC CUC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL HRK HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SLL SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD UYU UZS VES VND VUV WST XAF XCD XCG XDR XOF XPF XSU YER ZAR ZMW ZWG ZWL".split(
    " ",
  );
export const invoiceStatus = z.enum([
  "draft",
  "sent",
  "overdue",
  "paid",
  "settled",
  "cancelled",
]);
export const invoiceFields = z
  .object({
    clientId: resourceId,
    projectId: resourceId.nullable().default(null),
    currency: z
      .string()
      .refine(
        (value) => invoiceCurrencies.includes(value),
        "Choose a supported currency code.",
      ),
    dueDate: z.iso
      .date()
      .refine((value) => value >= "0001-01-01")
      .nullable()
      .default(null),
    notes: z.string().trim().max(4000).default(""),
    totalOverride: minor.positive().nullable().default(null),
    lineItems: z
      .array(
        z
          .object({
            description: z.string().trim().min(1).max(500),
            quantity: z
              .string()
              .regex(/^\d{1,7}(?:\.\d{1,2})?$/)
              .refine(
                (value) => Number(value) > 0,
                "Quantity must be positive.",
              ),
            unitPrice: minor,
          })
          .strict(),
      )
      .min(1)
      .max(100),
    milestoneIds: z
      .array(resourceId)
      .max(200)
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "Choose each milestone once.",
      )
      .default([]),
  })
  .strict();
export const settlementInput = z
  .object({
    amountReceived: minor.positive(),
    paymentMethod: z.enum([
      "bank_transfer",
      "platform_payment",
      "paypal",
      "cash",
      "crypto",
      "other",
    ]),
    reference: z.string().trim().min(1).max(500),
  })
  .strict();
export const invoiceDefaults = z
  .object({
    invoicePrefix: z
      .string()
      .trim()
      .regex(/^[A-Z0-9]{1,10}$/),
    invoiceNextNumber: z.number().int().min(1).max(2147483646),
    paymentInstructions: z.string().trim().max(4000),
  })
  .strict();

export function invoiceTotals(input: z.infer<typeof invoiceFields>): {
  items: {
    description: string;
    quantityHundredths: number;
    unitPrice: number;
    amount: number;
  }[];
  amount: number;
} {
  const items = input.lineItems.map((item) => {
    const [whole = "0", fraction = ""] = item.quantity.split(".");
    const quantityHundredths =
      Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
    // Nonnegative line amounts round half up to the currency's smallest unit.
    const amount = Number(
      (BigInt(quantityHundredths) * BigInt(item.unitPrice) + 50n) / 100n,
    );
    if (amount > 2147483647)
      throw new AppError(400, "INVALID_AMOUNT", "A line item is too large.");
    return {
      description: item.description,
      quantityHundredths,
      unitPrice: item.unitPrice,
      amount,
    };
  });
  const sum = items.reduce((total, item) => total + item.amount, 0);
  const amount = input.totalOverride ?? sum;
  if (sum > 2147483647 || amount <= 0)
    throw new AppError(
      400,
      "INVALID_AMOUNT",
      "Invoice total must be positive and within the supported amount.",
    );
  return { items, amount };
}
