-- Boş string displayValue'ları NULL'a çevir.
-- Attribute.displayValue String? (nullable) ancak admin formu boş bırakıldığında
-- "" (boş string) kaydediyordu. Bu NULL olmalı; aksi hâlde
-- getAttributeValueByGroup'taki ?? operatörü boş string'i geçirmiyor ve
-- normalizasyon fallback'i yanlış değerler üretiyordu.
UPDATE attributes
SET display_value = NULL
WHERE display_value = '';
