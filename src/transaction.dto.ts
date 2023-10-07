export class TransactionDto {
  constructor (
    readonly id: number,
    readonly date: Date,
    readonly description: string,
    readonly amount: number,
    readonly original: any
  ) {}

  static fromScrapper (data: any): TransactionDto {
    const symbol = data[0].includes('text-danger') ? '-' : '+';
    let amount = +data[7];

    if (symbol === '-') {
      amount = -amount;
    }

    return {
      id: +data[4],
      date: new Date(data[2]),
      description: data[6],
      amount,
      original: data
    }
  }
}
