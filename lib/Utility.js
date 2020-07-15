"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.printPartitionedText = void 0;
function printPartitionedText(text) {
    const textPartition = '----------------------------------------------------------------------------------------------------';
    console.log(`${textPartition}\n${text}\n${textPartition}`);
}
exports.printPartitionedText = printPartitionedText;
