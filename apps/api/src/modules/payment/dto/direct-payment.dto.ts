import { IsString, IsOptional, IsBoolean, IsNumber, Length, Matches } from 'class-validator';
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
    @ApiProperty({ description: 'Order ID' })
    @IsString()
    orderId: string;

    @ApiPropertyOptional({ description: 'Payment Provider (default: iyzico)' })
    @IsOptional()
    @IsString()
    provider?: string;

    @ApiPropertyOptional({ description: 'Use Saved Card Token' })
    @IsOptional()
    @IsString()
    cardToken?: string;

    @ApiPropertyOptional({ description: 'New Card Details' })
    @IsOptional()
    card?: CreditCardDto;

    @ApiPropertyOptional({ description: 'Save this card for future use' })
    @IsOptional()
    @IsBoolean()
    saveCard?: boolean;
}

export class AddCardDto {
    @ApiProperty({ description: 'Card Details' })
    card: CreditCardDto;

    @ApiPropertyOptional({ description: 'Card Alias' })
    @IsOptional()
    @IsString()
    cardAlias?: string;
}
