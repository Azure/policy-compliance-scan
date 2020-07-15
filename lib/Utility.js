"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sleep = exports.printPartitionedText = void 0;
function printPartitionedText(text) {
    const textPartition = '----------------------------------------------------------------------------------------------------';
    console.log(`${textPartition}\n${text}\n${textPartition}`);
}
exports.printPartitionedText = printPartitionedText;
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
exports.sleep = sleep;
