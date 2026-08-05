(function zipService(global) {
    'use strict';

    const encoder = new TextEncoder();
    let crcTable = null;

    function getCrcTable() {
        if (crcTable) return crcTable;
        crcTable = new Uint32Array(256);
        for (let value = 0; value < 256; value += 1) {
            let crc = value;
            for (let bit = 0; bit < 8; bit += 1) {
                crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
            }
            crcTable[value] = crc >>> 0;
        }
        return crcTable;
    }

    function crc32(bytes) {
        const table = getCrcTable();
        let crc = 0xFFFFFFFF;
        for (const byte of bytes) crc = table[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    function dosTimestamp(date = new Date()) {
        const year = Math.max(1980, date.getFullYear());
        const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
        const day = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
        return { time, day };
    }

    function write16(view, offset, value) { view.setUint16(offset, value, true); }
    function write32(view, offset, value) { view.setUint32(offset, value >>> 0, true); }

    async function createArchive(files) {
        if (!Array.isArray(files) || files.length === 0) throw new Error('沒有可打包的圖片');
        if (files.length > 65535) throw new Error('ZIP 檔案數量超過上限');

        const localParts = [];
        const centralParts = [];
        let offset = 0;
        const stamp = dosTimestamp();

        for (const file of files) {
            const nameBytes = encoder.encode(String(file.name || 'image.png'));
            const data = new Uint8Array(await file.blob.arrayBuffer());
            if (nameBytes.length > 65535 || data.length > 0xFFFFFFFF) throw new Error('單一檔案過大，無法建立 ZIP');
            const checksum = crc32(data);

            const localHeader = new Uint8Array(30);
            const localView = new DataView(localHeader.buffer);
            write32(localView, 0, 0x04034B50);
            write16(localView, 4, 20);
            write16(localView, 6, 0x0800);
            write16(localView, 8, 0);
            write16(localView, 10, stamp.time);
            write16(localView, 12, stamp.day);
            write32(localView, 14, checksum);
            write32(localView, 18, data.length);
            write32(localView, 22, data.length);
            write16(localView, 26, nameBytes.length);
            write16(localView, 28, 0);
            localParts.push(localHeader, nameBytes, data);

            const centralHeader = new Uint8Array(46);
            const centralView = new DataView(centralHeader.buffer);
            write32(centralView, 0, 0x02014B50);
            write16(centralView, 4, 20);
            write16(centralView, 6, 20);
            write16(centralView, 8, 0x0800);
            write16(centralView, 10, 0);
            write16(centralView, 12, stamp.time);
            write16(centralView, 14, stamp.day);
            write32(centralView, 16, checksum);
            write32(centralView, 20, data.length);
            write32(centralView, 24, data.length);
            write16(centralView, 28, nameBytes.length);
            write16(centralView, 30, 0);
            write16(centralView, 32, 0);
            write16(centralView, 34, 0);
            write16(centralView, 36, 0);
            write32(centralView, 38, 0);
            write32(centralView, 42, offset);
            centralParts.push(centralHeader, nameBytes);

            offset += localHeader.length + nameBytes.length + data.length;
            if (offset > 0xFFFFFFFF) throw new Error('ZIP 總大小超過 4GB 上限');
        }

        const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
        const end = new Uint8Array(22);
        const endView = new DataView(end.buffer);
        write32(endView, 0, 0x06054B50);
        write16(endView, 4, 0);
        write16(endView, 6, 0);
        write16(endView, 8, files.length);
        write16(endView, 10, files.length);
        write32(endView, 12, centralSize);
        write32(endView, 16, offset);
        write16(endView, 20, 0);

        return new Blob([...localParts, ...centralParts, end], { type: 'application/zip' });
    }

    global.ZipService = Object.freeze({ createArchive });
})(window);
