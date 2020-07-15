export function printPartitionedText(text) {
    const textPartition: string = '----------------------------------------------------------------------------------------------------';
    console.log(`${textPartition}\n${text}\n${textPartition}`);
  }
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }