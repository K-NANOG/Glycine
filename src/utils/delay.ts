/**
 * Utility function to create a delay/sleep in async functions
 * @param ms Time to delay in milliseconds
 * @returns Promise that resolves after the specified delay
 */
export const delay = (ms: number): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms));
}; 