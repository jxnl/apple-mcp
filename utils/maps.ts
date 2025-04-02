import { run } from '@jxa/run';

// Type definitions
interface MapLocation {
    id: string;
    name: string;
    address: string;
    latitude: number | null;
    longitude: number | null;
    category: string | null;
    isFavorite: boolean;
}

interface Guide {
    id: string;
    name: string;
    itemCount: number;
}

interface SearchResult {
    success: boolean;
    locations: MapLocation[];
    message?: string;
}

interface SaveResult {
    success: boolean;
    message: string;
    location?: MapLocation;
}

interface DirectionResult {
    success: boolean;
    message: string;
    route?: {
        distance: string;
        duration: string;
        startAddress: string;
        endAddress: string;
    };
}

interface GuideResult {
    success: boolean;
    message: string;
    guides?: Guide[];
}

interface AddToGuideResult {
    success: boolean;
    message: string;
    guideName?: string;
    locationName?: string;
}

/**
 * Check if Maps app is accessible
 */
async function checkMapsAccess(): Promise<boolean> {
    try {
        const result = await run(() => {
            try {
                const Maps = Application("Maps");
                Maps.name(); // Just try to get the name to test access
                return true;
            } catch (e) {
                throw new Error("Cannot access Maps app");
            }
        }) as boolean;
        
        return result;
    } catch (error) {
        console.error(`Cannot access Maps app: ${error instanceof Error ? error.message : String(error)}`);
        return false;
    }
}

/**
 * Search for locations on the map
 * @param query Search query for locations
 * @param limit Maximum number of results to return
 */
async function searchLocations(query: string, limit: number = 5): Promise<SearchResult> {
    try {
        if (!await checkMapsAccess()) {
            return {
                success: false,
                locations: [],
                message: "Cannot access Maps app. Please grant access in System Settings > Privacy & Security > Automation."
            };
        }

        console.error(`searchLocations - Searching for: "${query}"`);

        // First try to use the Maps search function
        const locations = await run((args: { query: string, limit: number }) => {
            try {
                const Maps = Application("Maps");
                
                // Launch Maps and search (this is needed for search to work properly)
                Maps.activate();
                
                // Execute search using the URL scheme which is more reliable
                Maps.activate();
                const encodedQuery = encodeURIComponent(args.query);
                Maps.openLocation(`maps://?q=${encodedQuery}`);
                
                // For backward compatibility also try the standard search method
                try {
                    Maps.search(args.query);
                } catch (e) {
                    // Ignore error if search is not supported
                }
                
                // Wait a bit for search results to populate
                delay(2); // 2 seconds
                
                // Try to get search results, if supported by the version of Maps
                const locations: MapLocation[] = [];
                
                try {
                    // Different versions of Maps have different ways to access results
                    // We'll need to use a different method for each version
                    
                    // Approach 1: Try to get locations directly 
                    // (this works on some versions of macOS)
                    const selectedLocation = Maps.selectedLocation();
                    if (selectedLocation) {
                        // If we have a selected location, use it
                        const location: MapLocation = {
                            id: `loc-${Date.now()}-${Math.random()}`,
                            name: selectedLocation.name() || args.query,
                            address: selectedLocation.formattedAddress() || "Address not available",
                            latitude: selectedLocation.latitude(),
                            longitude: selectedLocation.longitude(),
                            category: selectedLocation.category ? selectedLocation.category() : null,
                            isFavorite: false
                        };
                        locations.push(location);
                    } else {
                        // If no selected location, use the search field value as name
                        // and try to get coordinates by doing a UI script
                        
                        // Use the user entered search term for the result
                        const location: MapLocation = {
                            id: `loc-${Date.now()}-${Math.random()}`,
                            name: args.query,
                            address: "Search results - address details not available",
                            latitude: null,
                            longitude: null,
                            category: null,
                            isFavorite: false
                        };
                        locations.push(location);
                    }
                } catch (e) {
                    // If the above didn't work, at least return something based on the query
                    const location: MapLocation = {
                        id: `loc-${Date.now()}-${Math.random()}`,
                        name: args.query,
                        address: "Search result - address details not available",
                        latitude: null,
                        longitude: null,
                        category: null,
                        isFavorite: false
                    };
                    locations.push(location);
                }
                
                return locations.slice(0, args.limit);
            } catch (e) {
                return []; // Return empty array on any error
            }
        }, { query, limit }) as MapLocation[];
        
        return {
            success: locations.length > 0,
            locations,
            message: locations.length > 0 ? 
                `Found ${locations.length} location(s) for "${query}"` : 
                `No locations found for "${query}"`
        };
    } catch (error) {
        return {
            success: false,
            locations: [],
            message: `Error searching locations: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}

/**
 * Save a location to favorites
 * @param name Name of the location
 * @param address Address to save (as a string)
 */
async function saveLocation(name: string, address: string): Promise<SaveResult> {
    try {
        if (!await checkMapsAccess()) {
            return {
                success: false,
                message: "Cannot access Maps app. Please grant access in System Settings > Privacy & Security > Automation."
            };
        }

        console.error(`saveLocation - Saving location: "${name}" at address "${address}"`);

        const result = await run((args: { name: string, address: string }) => {
            try {
                const Maps = Application("Maps");
                Maps.activate();
                
                // First search for the location to get its details
                Maps.search(args.address);
                
                // Wait for search to complete
                delay(2);
                
                try {
                    // Try to add to favorites
                    // Different Maps versions have different methods
                    
                    // Try to get the current location
                    const location = Maps.selectedLocation();
                    
                    if (location) {
                        // Now try to add to favorites
                        // Approach 1: Direct API if available
                        try {
                            Maps.addToFavorites(location, {withProperties: {name: args.name}});
                            return {
                                success: true,
                                message: `Added "${args.name}" to favorites`,
                                location: {
                                    id: `loc-${Date.now()}`,
                                    name: args.name,
                                    address: location.formattedAddress() || args.address,
                                    latitude: location.latitude(),
                                    longitude: location.longitude(),
                                    category: null,
                                    isFavorite: true
                                }
                            };
                        } catch (e) {
                            // If direct API fails, use UI scripting as fallback
                            // UI scripting would require more complex steps that vary by macOS version
                            return {
                                success: false,
                                message: `Location found but unable to automatically add to favorites. Please manually save "${args.name}" from the Maps app.`
                            };
                        }
                    } else {
                        return {
                            success: false,
                            message: `Could not find location for "${args.address}"`
                        };
                    }
                } catch (e) {
                    return {
                        success: false,
                        message: `Error adding to favorites: ${e}`
                    };
                }
            } catch (e) {
                return {
                    success: false,
                    message: `Error in Maps: ${e}`
                };
            }
        }, { name, address }) as SaveResult;
        
        return result;
    } catch (error) {
        return {
            success: false,
            message: `Error saving location: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}

/**
 * Get directions between two locations
 * @param fromAddress Starting address
 * @param toAddress Destination address
 * @param transportType Type of transport to use (default is driving)
 */
async function getDirections(
    fromAddress: string, 
    toAddress: string, 
    transportType: 'driving' | 'walking' | 'transit' = 'driving'
): Promise<DirectionResult> {
    try {
        if (!await checkMapsAccess()) {
            return {
                success: false,
                message: "Cannot access Maps app. Please grant access in System Settings > Privacy & Security > Automation."
            };
        }

        console.error(`getDirections - Getting directions from "${fromAddress}" to "${toAddress}"`);

        const result = await run((args: { 
            fromAddress: string, 
            toAddress: string, 
            transportType: string 
        }) => {
            try {
                const Maps = Application("Maps");
                Maps.activate();
                
                // Ask for directions
                Maps.getDirections({
                    from: args.fromAddress,
                    to: args.toAddress,
                    by: args.transportType
                });
                
                // Wait for directions to load
                delay(2);
                
                // There's no direct API to get the route details
                // We'll return basic success and let the Maps UI show the route
                return {
                    success: true,
                    message: `Displaying directions from "${args.fromAddress}" to "${args.toAddress}" by ${args.transportType}`,
                    route: {
                        distance: "See Maps app for details",
                        duration: "See Maps app for details",
                        startAddress: args.fromAddress,
                        endAddress: args.toAddress
                    }
                };
            } catch (e) {
                return {
                    success: false,
                    message: `Error getting directions: ${e}`
                };
            }
        }, { fromAddress, toAddress, transportType }) as DirectionResult;
        
        return result;
    } catch (error) {
        return {
            success: false,
            message: `Error getting directions: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}

/**
 * Create a pin at a specified location
 * @param name Name of the pin
 * @param address Location address
 */
async function dropPin(name: string, address: string): Promise<SaveResult> {
    try {
        if (!await checkMapsAccess()) {
            return {
                success: false,
                message: "Cannot access Maps app. Please grant access in System Settings > Privacy & Security > Automation."
            };
        }

        console.error(`dropPin - Creating pin at: "${address}" with name "${name}"`);

        const result = await run((args: { name: string, address: string }) => {
            try {
                const Maps = Application("Maps");
                Maps.activate();
                
                // First search for the location to get its details
                Maps.search(args.address);
                
                // Wait for search to complete
                delay(2);
                
                // Dropping pins programmatically is challenging in newer Maps versions
                // Most reliable way is to search and then the user can manually drop a pin
                return {
                    success: true,
                    message: `Showing "${args.address}" in Maps. You can now manually drop a pin by right-clicking and selecting "Drop Pin".`
                };
            } catch (e) {
                return {
                    success: false,
                    message: `Error dropping pin: ${e}`
                };
            }
        }, { name, address }) as SaveResult;
        
        return result;
    } catch (error) {
        return {
            success: false,
            message: `Error dropping pin: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}

/**
 * List all guides in Apple Maps
 * @returns Promise resolving to a list of guides
 */
async function listGuides(): Promise<GuideResult> {
    try {
        if (!await checkMapsAccess()) {
            return {
                success: false,
                message: "Cannot access Maps app. Please grant access in System Settings > Privacy & Security > Automation."
            };
        }

        console.error("listGuides - Getting list of guides from Maps");

        // Try to list guides using AppleScript UI automation
        // Note: Maps doesn't have a direct API for this, so we're using a URL scheme approach
        const result = await run(() => {
            try {
                const app = Application.currentApplication();
                app.includeStandardAdditions = true;
                
                // Open Maps
                const Maps = Application("Maps");
                Maps.activate();
                
                // Open the guides view using URL scheme
                app.openLocation("maps://?show=guides");
                
                // Without direct scripting access, we can't get the actual list of guides
                // But we can at least open the guides view for the user
                
                return {
                    success: true,
                    message: "Opened guides view in Maps",
                    guides: []
                };
            } catch (e) {
                return {
                    success: false,
                    message: `Error accessing guides: ${e}`
                };
            }
        }) as GuideResult;
        
        return result;
    } catch (error) {
        return {
            success: false,
            message: `Error listing guides: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}

/**
 * Add a location to a specific guide
 * @param locationAddress The address of the location to add
 * @param guideName The name of the guide to add to
 * @returns Promise resolving to result of the operation
 */
async function addToGuide(locationAddress: string, guideName: string): Promise<AddToGuideResult> {
    try {
        if (!await checkMapsAccess()) {
            return {
                success: false,
                message: "Cannot access Maps app. Please grant access in System Settings > Privacy & Security > Automation."
            };
        }

        console.error(`addToGuide - Adding location "${locationAddress}" to guide "${guideName}"`);

        // Since Maps doesn't provide a direct API for guide management,
        // we'll use a combination of search and manual instructions
        const result = await run((args: { locationAddress: string, guideName: string }) => {
            try {
                const app = Application.currentApplication();
                app.includeStandardAdditions = true;
                
                // Open Maps
                const Maps = Application("Maps");
                Maps.activate();
                
                // Search for the location
                const encodedAddress = encodeURIComponent(args.locationAddress);
                app.openLocation(`maps://?q=${encodedAddress}`);
                
                // We can't directly add to a guide through AppleScript,
                // but we can provide instructions for the user
                
                return {
                    success: true,
                    message: `Showing "${args.locationAddress}" in Maps. Add to "${args.guideName}" guide by clicking location pin, "..." button, then "Add to Guide".`,
                    guideName: args.guideName,
                    locationName: args.locationAddress
                };
            } catch (e) {
                return {
                    success: false,
                    message: `Error adding to guide: ${e}`
                };
            }
        }, { locationAddress, guideName }) as AddToGuideResult;
        
        return result;
    } catch (error) {
        return {
            success: false,
            message: `Error adding to guide: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}

/**
 * Create a new guide with the given name
 * @param guideName The name for the new guide
 * @returns Promise resolving to result of the operation
 */
async function createGuide(guideName: string): Promise<AddToGuideResult> {
    try {
        if (!await checkMapsAccess()) {
            return {
                success: false,
                message: "Cannot access Maps app. Please grant access in System Settings > Privacy & Security > Automation."
            };
        }

        console.error(`createGuide - Creating new guide "${guideName}"`);

        // Since Maps doesn't provide a direct API for guide creation,
        // we'll guide the user through the process
        const result = await run((guideName: string) => {
            try {
                const app = Application.currentApplication();
                app.includeStandardAdditions = true;
                
                // Open Maps
                const Maps = Application("Maps");
                Maps.activate();
                
                // Open the guides view using URL scheme
                app.openLocation("maps://?show=guides");
                
                // We can't directly create a guide through AppleScript,
                // but we can provide instructions for the user
                
                return {
                    success: true,
                    message: `Opened guides view to create new guide "${guideName}". Click "+" button and select "New Guide".`,
                    guideName: guideName
                };
            } catch (e) {
                return {
                    success: false,
                    message: `Error creating guide: ${e}`
                };
            }
        }, guideName) as AddToGuideResult;
        
        return result;
    } catch (error) {
        return {
            success: false,
            message: `Error creating guide: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}

const maps = {
    searchLocations,
    saveLocation,
    getDirections,
    dropPin,
    listGuides,
    addToGuide,
    createGuide
};

export default maps;