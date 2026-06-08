declare module 'opencc-js' {
    export interface ConverterOptions {
        from?: 'cn' | 'tw' | 'hk' | 't' | 's' | 'twp' | 'hkp';
        to?: 'cn' | 'tw' | 'hk' | 't' | 's' | 'twp' | 'hkp';
    }

    export type ConvertText = (text: string) => string;

    export function Converter(options: ConverterOptions): ConvertText;
}
