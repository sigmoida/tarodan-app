import { IsString, IsOptional, IsNumber, Length, Matches, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreditCardDto {
    @ApiProperty({ description: 'Card Holder Name' })
    @IsString()
    @Length(1, 100)
    cardHolderName: string;

    @ApiProperty({ description: 'Card Number' })
    @IsString()
    @Matches(/^[0-9]{15,16}$/, { message: 'Invalid card number' })
    cardNumber: string;

    @ApiProperty({ description: 'Expire Month (MM)' })
    @IsString()
    @Length(2, 2)
    expireMonth: string;

    @ApiProperty({ description: 'Expire Year (YY or YYYY)' })
    @IsString()
    @Length(2, 4)
    expireYear: string;

    @ApiProperty({ description: 'CVC' })
    @IsString()
    @Length(3, 4)
    cvc: string;

    @ApiPropertyOptional({ description: 'Card Alias for saving' })
    @IsOptional()
    @IsString()
    cardAlias?: string;
}

export class DirectPaymentDto {
    @ApiPropertyOptional({ description: 'Order ID (tekil sipariş ödemesi)' })
    @IsOptional()
    @IsString()
    orderId?: string;

    @ApiPropertyOptional({ description: 'Checkout Group ID (sepet ödemesi)' })
    @IsOptional()
    @IsString()
    checkoutGroupId?: string;

    @ApiPropertyOptional({ description: 'Trade ID (takas nakit farkı ödemesi)' })
    @IsOptional()
    @IsString()
    tradeId?: string;

    @ApiPropertyOptional({ description: 'Payment Provider (default: paytr)' })
    @IsOptional()
    @IsString()
    provider?: string;

    @ApiPropertyOptional({ description: 'Use Saved Card Token' })
    @IsOptional()
    @IsString()
    cardToken?: string;

    @ApiPropertyOptional({ description: 'New Card Details' })
    @IsOptional()
    @ValidateNested()
    @Type(() => CreditCardDto)
    card?: CreditCardDto;

}

export class AddCardDto {
    // Nested şekil: { card: { cardNumber, ... } }
    @ApiPropertyOptional({ description: 'Card Details (nested)' })
    @IsOptional()
    @ValidateNested()
    @Type(() => CreditCardDto)
    card?: CreditCardDto;

    // Düz (top-level) şekil: { cardNumber, ... } — bazı istemciler böyle gönderiyor.
    // whitelist:true bunları DTO'da tanımlı olmazsa siliyordu → controller'da
    // dto.card undefined kalıp 500 atıyordu. İkisini de kabul ediyoruz.
    @IsOptional() @IsString() cardNumber?: string;
    @IsOptional() @IsString() cardHolderName?: string;
    @IsOptional() @IsString() expireMonth?: string;
    @IsOptional() @IsString() expireYear?: string;
    @IsOptional() @IsString() cvc?: string;

    @ApiPropertyOptional({ description: 'Card Alias' })
    @IsOptional()
    @IsString()
    cardAlias?: string;
}
