window.addEventListener('load', () => {
    // --- DOM Elements ---
    const fileInput = document.getElementById('jsonFileInput');
    const shotDetailsContainer = document.getElementById('shotDetails');
    const chartsContainer = document.getElementById('chartsContainer');
    const errorMessage = document.getElementById('errorMessage');
    const mainCtx = document.getElementById('mainChart').getContext('2d');
    const tempCtx = document.getElementById('temperatureChart').getContext('2d');
    const exportButton = document.getElementById('exportButton');
    const themeToggle = document.getElementById('theme-toggle');
    const exportWrapper = document.getElementById('export-wrapper');
    const customTooltip = document.getElementById('customTooltip');
    const dropArea = document.getElementById('drop-area'); 
    const selectFilesLink = document.getElementById('selectFilesLink'); 
    const selectFileButton = document.getElementById('selectFileButton'); 
    const shotVitalsContainer = document.getElementById('shotVitals'); 
    const titleIcon = document.getElementById('titleIcon');
    const compareButton = document.getElementById('compareButton');
    const compareFileInput = document.getElementById('compareFileInput');
    const clearCompareButton = document.getElementById('clearCompareButton');

    // --- State Variables ---
    let mainChart, temperatureChart;
    let chartDataStore = {};
    let compareDataStore = null;
    let datasetConfigStore = {};
    let currentProfileName = '';
    let currentTimestamp = '';
    let originalMaxTime = 0;

    // --- Utility Functions ---
    const isDarkMode = () => !document.body.classList.contains('light-mode');
    
    const findClosestIndex = (timeArray, hoverTime) => {
        if (!timeArray || timeArray.length === 0) return -1;
        let closestIndex = 0;
        let minDiff = Infinity;
        for (let i = 0; i < timeArray.length; i++) {
            const diff = Math.abs(timeArray[i] - hoverTime);
            if (diff < minDiff) {
                minDiff = diff;
                closestIndex = i;
            }
            if (diff > minDiff && timeArray[i] > hoverTime) break;
        }
        return closestIndex;
    };

    // --- Chart.js Plugins ---
    const syncedHoverLine = {
        id: 'syncedHoverLine',
        afterDatasetsDraw: (chart) => {
            if (!chart.currentEventPosition) return;
            
            const ctx = chart.ctx;
            const x = chart.currentEventPosition.x;
            const topY = chart.chartArea.top;
            const bottomY = chart.chartArea.bottom;
            
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(x, topY);
            ctx.lineTo(x, bottomY);
            ctx.lineWidth = 1;
            ctx.strokeStyle = isDarkMode() ? 'rgba(180, 180, 180, 0.7)' : 'rgba(70, 70, 70, 0.7)';
            ctx.setLineDash([6, 6]);
            ctx.stroke();
            
            if (chart.canvas.id === 'mainChart') {
                const y = chart.currentEventPosition.y;
                const leftX = chart.chartArea.left;
                const rightX = chart.chartArea.right;

                ctx.beginPath();
                ctx.moveTo(leftX, y);
                ctx.lineTo(rightX, y);
                ctx.lineWidth = 1;
                ctx.strokeStyle = isDarkMode() ? 'rgba(180, 180, 180, 0.7)' : 'rgba(70, 70, 70, 0.7)';
                ctx.setLineDash([6, 6]);
                ctx.stroke();
            }

            ctx.restore();
        }
    };

    const targetChangeLines = {
        id: 'targetChangeLines',
        afterDatasetsDraw: (chart) => {
            const lines = chart.options.plugins.targetChangeLines?.lines;
            if (!lines) return;

            const { ctx, chartArea: { top }, scales: { x } } = chart;
            
            if (chart.canvas.id === 'mainChart' && chartDataStore.t) {
                const lastDataIndex = chartDataStore.t.length - 1;
                if (lastDataIndex < 0) return;
                
                const finalTime = chartDataStore.t[lastDataIndex];
                const allTimes = [0, ...lines, finalTime];

                ctx.save();
                ctx.fillStyle = isDarkMode() ? '#F5F5F5' : '#212121';
                ctx.textAlign = 'center';
                ctx.font = 'bold 12px Roboto, sans-serif';

                for (let i = 1; i < allTimes.length; i++) {
                    const startTime = allTimes[i-1];
                    const endTime = allTimes[i];
                    const duration = endTime - startTime;

                    if (duration > 0.1) { 
                        const startIndex = chartDataStore.t.findIndex(t => t >= startTime);
                        let endIndex = chartDataStore.t.findLastIndex(t => t <= endTime);
                        if (endIndex < startIndex) endIndex = startIndex;

                        if (startIndex !== -1) {
                            const startVolume = chartDataStore.v[startIndex] || 0;
                            const endVolume = chartDataStore.v[endIndex] || startVolume;
                            const volumeChange = endVolume - startVolume;

                            const lastXPos = x.getPixelForValue(startTime);
                            const currentXPos = x.getPixelForValue(endTime);
                            const midX = (lastXPos + currentXPos) / 2;
                            const text = `${duration.toFixed(1)}s (${volumeChange.toFixed(1)}g)`;
                            ctx.fillText(text, midX, top - 10);
                        }
                    }
                }
                ctx.restore();
            }

            lines.forEach(time => {
                const xPos = x.getPixelForValue(time);
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(xPos, chart.chartArea.top);
                ctx.lineTo(xPos, chart.chartArea.bottom);
                ctx.lineWidth = 1;
                ctx.strokeStyle = isDarkMode() ? 'rgba(255, 255, 100, 0.5)' : 'rgba(100, 100, 0, 0.8)';
                ctx.setLineDash([4, 4]);
                ctx.stroke();
                ctx.restore();
            });
        }
    };

    Chart.register(syncedHoverLine, targetChangeLines);
    Chart.defaults.font.family = 'Roboto, sans-serif';
    Chart.defaults.font.size = 13;

    // --- Event Handlers ---
    if (titleIcon) {
        titleIcon.style.cursor = 'pointer';
        titleIcon.addEventListener('click', () => {
            window.open('http://gaggimate.local/', '_blank');
        });
    }

    const masterSyncHandler = (event) => {
        if (!mainChart || !temperatureChart) return;
    
        const getRelativePosition = (e, chart) => {
            const rect = chart.canvas.getBoundingClientRect();
            return { x: e.clientX - rect.left, y: e.clientY - rect.top };
        };
        const posMain = getRelativePosition(event, mainChart);
        
        if (posMain.x >= mainChart.chartArea.left && posMain.x <= mainChart.chartArea.right &&
            posMain.y >= mainChart.chartArea.top && posMain.y <= mainChart.chartArea.bottom) {
    
            const posTemp = getRelativePosition(event, temperatureChart);
            mainChart.currentEventPosition = posMain;
            temperatureChart.currentEventPosition = posTemp;
    
            const time = mainChart.scales.x.getValueForPixel(posMain.x);
    
            const primaryIndex = findClosestIndex(chartDataStore.t, time);
            const compareIndex = findClosestIndex(compareDataStore?.t, time);
            
            if (primaryIndex !== -1) {
                const hoverTime = chartDataStore.t[primaryIndex];
                const volume = chartDataStore.v[primaryIndex];
                
                if (customTooltip) {
                    customTooltip.style.display = 'block';
                    let innerHtml = `<div>Time: ${time.toFixed(2)} s</div>`;
                    if (hoverTime <= (chartDataStore.t[chartDataStore.t.length - 1] || 0) && volume !== undefined && volume !== null) {
                        innerHtml += `<div>Volume: ${volume.toFixed(2)} g</div>`;
                    }
                    customTooltip.innerHTML = innerHtml;
    
                    const xOffset = 15;
                    let x = event.clientX + xOffset;
                    let y = event.clientY;
    
                    if (x + customTooltip.offsetWidth > window.innerWidth) {
                        x = event.clientX - customTooltip.offsetWidth - xOffset;
                    }
                    
                    if (y + customTooltip.offsetHeight > window.innerHeight) {
                        y = event.clientY - customTooltip.offsetHeight;
                    }
    
                    customTooltip.style.left = `${x}px`;
                    customTooltip.style.top = `${y}px`;
                }
            }
            
            updateLegendValues(mainChart, primaryIndex, compareIndex, time);
            updateLegendValues(temperatureChart, primaryIndex, compareIndex, time);
            mainChart.update('none');
            temperatureChart.update('none');
    
        } else {
            masterMouseoutHandler(); 
        }
    };

    const masterMouseoutHandler = () => {
        if (!mainChart || !temperatureChart) return;

        if (customTooltip) {
            customTooltip.style.display = 'none';
        }

        mainChart.currentEventPosition = null;
        temperatureChart.currentEventPosition = null;
        
        clearLegendValues(mainChart);
        clearLegendValues(temperatureChart);

        updateTempDifference(); 

        mainChart.update('none');
        temperatureChart.update('none');
    };
    
    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;
        
        errorMessage.textContent = '';
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const jsonData = JSON.parse(e.target.result);
                exportWrapper.style.display = 'block';
                processAndDrawCharts(jsonData);
                shotDetailsContainer.style.display = 'flex';
                chartsContainer.style.display = 'block';
                shotVitalsContainer.style.display = 'block'; 
                exportButton.style.display = 'flex';
                compareButton.style.display = 'flex';
                dropArea.style.display = 'none'; 
            } catch (error) {
                errorMessage.textContent = 'Error processing file. Check file format.';
                console.error('File Processing Error:', error);
            }
        };
        reader.readAsText(file);
        fileInput.value = null; 
    });

    compareButton.addEventListener('click', () => {
        compareFileInput.click();
    });

    compareFileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;
        
        errorMessage.textContent = 'Processing comparison...';
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const jsonData = JSON.parse(e.target.result);
                processComparisonData(jsonData);
                errorMessage.textContent = '';
                clearCompareButton.style.display = 'flex';
            } catch (error) {
                errorMessage.textContent = 'Error processing comparison file. Check format and content.';
                 if (error instanceof SyntaxError) {
                    console.error('JSON Parse Error:', error);
                } else {
                    console.error('Data Processing Error:', error);
                }
            }
        };
        reader.readAsText(file);
        compareFileInput.value = null; 
    });
    
    clearCompareButton.addEventListener('click', () => {
        if (!mainChart) return;

        mainChart.data.datasets = mainChart.data.datasets.filter(ds => !ds.label.includes('(Compare)'));
        temperatureChart.data.datasets = temperatureChart.data.datasets.filter(ds => !ds.label.includes('(Compare)'));
        
        mainChart.options.scales.x.max = originalMaxTime;
        temperatureChart.options.scales.x.max = originalMaxTime;

        mainChart.update('none');
        temperatureChart.update('none');
        
        compareDataStore = null; 
        
        generateCustomLegend('mainChartLegend', mainChart, datasetConfigStore);
        generateCustomLegend('temperatureChartLegend', temperatureChart, datasetConfigStore);
        
        clearCompareButton.style.display = 'none';
        compareFileInput.value = null; 
    });


    const handleExport = () => {
        if (typeof html2canvas === 'undefined') {
            alert('Export functionality is not available.');
            return;
        }

        const replacements = [];
        const elementsToReplace = document.querySelectorAll('#shotDescription, #shotVitals .vitals-input, #shotVitals .vitals-textarea');

        elementsToReplace.forEach(el => {
            const isTextarea = el.tagName === 'TEXTAREA';
            const isInput = el.tagName === 'INPUT';
            if (!isTextarea && !isInput) return;

            const tempDiv = document.createElement('div');
            const style = window.getComputedStyle(el);

            tempDiv.style.font = style.font;
            tempDiv.style.color = style.color;
            tempDiv.style.width = style.width;
            tempDiv.style.padding = style.padding;
            tempDiv.style.boxSizing = 'border-box';
            tempDiv.style.textAlign = style.textAlign;
            
            let value = el.value;
            tempDiv.textContent = value;
            
            if (isTextarea) {
                tempDiv.style.whiteSpace = 'pre-wrap';
                tempDiv.style.wordWrap = 'break-word';
                tempDiv.style.minHeight = style.height;
            }

            el.style.display = 'none';
            el.parentNode.insertBefore(tempDiv, el);
            replacements.push({ original: el, temp: tempDiv });
        });

        mainChart.options.animation = false;
        temperatureChart.options.animation = false;
        mainChart.update('none');
        temperatureChart.update('none');
        
        const exportBgColor = isDarkMode() ? 'rgb(0,0,0)' : 'rgb(255,255,255)';

        setTimeout(() => {
            html2canvas(exportWrapper, {
                backgroundColor: exportBgColor,
                logging: false,
                useCORS: true,
                scale: 2,
            }).then(canvas => {
                const link = document.createElement('a');
                const profileName = (currentProfileName || 'espresso-shot').replace(/\s+/g, '-');
                const timestampFormatted = new Date().toISOString().slice(0, 10).replace(/-/g, '');
                link.download = `${profileName}-${timestampFormatted}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
                
                mainChart.options.animation = {};
                temperatureChart.options.animation = {};
                
                replacements.forEach(item => {
                    item.original.style.display = '';
                    item.temp.remove();
                });
            });
        }, 100);
    };

    exportButton.addEventListener('click', handleExport);

    themeToggle.addEventListener('change', () => {
        document.body.classList.toggle('light-mode');
        if (mainChart) {
            updateChartColors();
            mainChart.update();
            temperatureChart.update();
            generateCustomLegend('mainChartLegend', mainChart, datasetConfigStore);
            generateCustomLegend('temperatureChartLegend', temperatureChart, datasetConfigStore);
            updateTempDifference();
        }
    });
    
    selectFilesLink.addEventListener('click', (e) => {
        e.preventDefault();
        fileInput.click();
    });
    
    selectFileButton.addEventListener('click', () => {
        fileInput.click();
    });

    const dropZones = [dropArea, chartsContainer];
    dropZones.forEach(zone => {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            zone.addEventListener(eventName, preventDefaults, false);
        });

        if (zone === dropArea) { 
            ['dragenter', 'dragover'].forEach(eventName => {
                zone.addEventListener(eventName, highlight, false);
            });
            ['dragleave', 'drop'].forEach(eventName => {
                zone.addEventListener(eventName, unhighlight, false);
            });
        }

        zone.addEventListener('drop', handleDrop, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    function highlight() {
        dropArea.classList.add('highlight');
    }

    function unhighlight() {
        dropArea.classList.remove('highlight');
    }

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;

        if (files.length > 0) {
            const file = files[0];
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const jsonData = JSON.parse(e.target.result);
                    exportWrapper.style.display = 'block';
                    processAndDrawCharts(jsonData);
                    shotDetailsContainer.style.display = 'flex';
                    chartsContainer.style.display = 'block';
                    shotVitalsContainer.style.display = 'block'; 
                    exportButton.style.display = 'flex';
                    compareButton.style.display = 'flex';
                    dropArea.style.display = 'none'; 
                } catch (error) {
                    errorMessage.textContent = 'Error processing file. Check file format.';
                    console.error('File Processing Error:', error);
                }
            };
            reader.readAsText(file);
            fileInput.value = null; 
        }
    }
    
    function updateTempDifference() {
        const tempDiffElement = document.getElementById('temp-diff-value');
        if (!tempDiffElement) return;
        if (!chartDataStore.ct || chartDataStore.ct.length === 0) return;

        const lastDataIndex = chartDataStore.ct.length - 1;
        const finalTemp = chartDataStore.ct[lastDataIndex];
        const finalTargetTemp = chartDataStore.tt[lastDataIndex];

        if (finalTemp != null && finalTargetTemp != null) {
            const tempDifference = (finalTargetTemp - finalTemp);
            tempDiffElement.textContent = `${tempDifference.toFixed(2)} °C`;
        } else {
            tempDiffElement.textContent = '---';
        }
    }

    // --- Chart Logic ---
    function processComparisonData(jsonData) {
        if (!jsonData.samples || !Array.isArray(jsonData.samples)) {
            errorMessage.textContent = 'Comparison file is missing valid "samples" data.';
            return;
        }

        const compareSamples = jsonData.samples;
        const compareStartTime = compareSamples[0]?.t || 0;
        
        compareDataStore = {};
        const compareKeys = ['t', 'cp', 'fl', 'pf', 'tf', 'vf', 'v', 'ev', 'ct', 'tt', 'tp'];
        compareKeys.forEach(key => {
            if (compareSamples.some(s => s[key] !== undefined)) {
                if (key === 't') {
                    compareDataStore.t = compareSamples.map(s => (s.t - compareStartTime) / 1000);
                } else {
                    compareDataStore[key] = compareSamples.map(s => s[key]);
                }
            }
        });

        const compareDuration = compareDataStore.t ? compareDataStore.t[compareDataStore.t.length - 1] : 0;
        const maxDuration = Math.max(originalMaxTime, compareDuration);
        
        mainChart.data.datasets = mainChart.data.datasets.filter(ds => !ds.label.includes('(Compare)'));
        temperatureChart.data.datasets = temperatureChart.data.datasets.filter(ds => !ds.label.includes('(Compare)'));

        const compareDatasetConfig = {
            cp_compare: { label: 'Pressure (Compare)', color: 'rgba(0, 255, 255, 0.5)', lightColor: 'rgba(0, 0, 255, 0.5)', yAxisID: 'yPrimary', unit: 'bar' },
            fl_compare: { label: 'Pump Flow (Compare)', color: 'rgba(255, 0, 255, 0.5)', lightColor: 'rgba(128, 0, 128, 0.5)', yAxisID: 'yPrimary', unit: 'g/s' }
        };

        Object.keys(compareDatasetConfig).forEach(key => {
            const dataKey = key.replace('_compare', '');
            if (compareDataStore[dataKey]) {
                const config = compareDatasetConfig[key];
                mainChart.data.datasets.push({
                    label: config.label,
                    data: compareDataStore[dataKey].map((val, i) => ({ x: compareDataStore.t[i], y: val })),
                    borderColor: isDarkMode() ? config.color : config.lightColor,
                    borderWidth: 2,
                    pointRadius: 0,
                    yAxisID: config.yAxisID,
                    tension: 0.4
                });
                datasetConfigStore[key] = config;
            }
        });

        mainChart.options.scales.x.max = maxDuration;
        temperatureChart.options.scales.x.max = maxDuration;
        mainChart.update();
        temperatureChart.update();

        generateCustomLegend('mainChartLegend', mainChart, datasetConfigStore);
    }

    function processAndDrawCharts(shotData) {
        if (mainChart) {
            clearCompareButton.click();
        }

        if (!shotData.samples || !Array.isArray(shotData.samples) || shotData.samples.length === 0) {
            errorMessage.textContent = 'Shot JSON is missing "samples" data.';
            return;
        }

        currentProfileName = shotData.profile;
        currentTimestamp = shotData.timestamp;

        // THIS IS THE DEFINITION THAT WAS MISSING
        const datasetConfig = {
            t:  { label: 'Time', isTime: true, unit: 's' },
            cp: { label: 'Pressure', color: '#00FFFF', lightColor: '#0000FF', visible: true, yAxisID: 'yPrimary', unit: 'bar', width: 3 },
            fl: { label: 'Pump Flow', color: '#FF00FF', lightColor: '#800080', visible: true, yAxisID: 'yPrimary', unit: 'g/s', width: 3 },
            pf: { label: 'Puck Flow', color: '#BADA55', lightColor: '#558B2F', visible: false, yAxisID: 'yPrimary', unit: 'g/s' },
            tf: { label: 'Target Pump Flow', color: '#00BFA5', lightColor: '#00695C', visible: true, yAxisID: 'yPrimary', dash: [5, 5], unit: 'g/s', width: 3, fill: true, backgroundColor: 'rgba(255, 255, 0, 0.05)' },
            vf: { label: 'Volume Flow', color: '#C0C0C0', lightColor: '#6B6B6B', visible: false, yAxisID: 'yPrimary', unit: 'g/s' },
            v:  { label: 'Volume', color: '#8A2BE2', lightColor: '#4B0082', visible: false, yAxisID: 'yPrimary', unit: 'g' },
            ev: { label: 'Estimated Volume', color: '#FF4500', lightColor: '#B22222', visible: false, yAxisID: 'yPrimary', dash: [5, 5], unit: 'g' },
            ct: { label: 'Temperature', color: '#FFA500', lightColor: '#FF8C00', visible: true, yAxisID: 'yTemp', unit: '°C', width: 3 },
            tt: { label: 'Target Temperature', color: '#FF0000', lightColor: '#B22222', visible: true, yAxisID: 'yTemp', dash: [5, 5], unit: '°C' }
        };

        if (shotData.samples.some(s => s.tp !== undefined && s.tp !== null)) {
            datasetConfig.tp = { label: 'Target Pressure', color: '#FFFFFF', lightColor: '#000000', visible: true, yAxisID: 'yPrimary', dash: [5, 5], unit: 'bar', width: 3, fill: true, backgroundColor: 'rgba(0, 255, 255, 0.05)' };
        } else {
             delete datasetConfig.tp;
        }
        
        datasetConfigStore = datasetConfig;

        const samples = shotData.samples;
        const startTime = samples[0]?.t || 0; 

        const labels = samples.map(s => (s.t - startTime) / 1000);
        chartDataStore = {};
        
        for (const key in datasetConfig) {
            if (key === 't') {
                 chartDataStore[key] = samples.map(s => (s.t - startTime) / 1000);
            } else if (datasetConfig[key].yAxisID) {
                chartDataStore[key] = samples.map(s => s[key]);
            }
        }
        
        displayShotDetails(shotData);

        if (mainChart) mainChart.destroy();
        if (temperatureChart) temperatureChart.destroy();
        
        const findPhaseChangeTimes = (samples) => {
            const times = new Set();
            const minTimeDiffMs = 1000;
            const samplesToConsider = samples.filter(s => s.tp !== null || s.tf !== null);

            let maxTp = -Infinity;
            let maxTf = -Infinity;
            samplesToConsider.forEach(s => {
                if (s.tp > maxTp) maxTp = s.tp;
                if (s.tf > maxTf) maxTf = s.tf;
            });
            const maxTpSample = samplesToConsider.find(s => s.tp === maxTp);
            if (maxTpSample) times.add(maxTpSample.t / 1000);
            const maxTfSample = samplesToConsider.find(s => s.tf === maxTf);
            if (maxTfSample) times.add(maxTfSample.t / 1000);

            for (let i = 2; i < samplesToConsider.length; i++) {
                const p1 = samplesToConsider[i-2];
                const p2 = samplesToConsider[i-1];
                const p3 = samplesToConsider[i];

                const time1 = (p2.t - p1.t) || 1;
                const time2 = (p3.t - p2.t) || 1;
                const slopeTp1 = (p2.tp - p1.tp) / time1;
                const slopeTp2 = (p3.tp - p2.tp) / time2;
                const slopeTf1 = (p2.tf - p1.tf) / time1;
                const slopeTf2 = (p3.tf - p2.tf) / time2;
                
                const slopeChangeThreshold = 0.05;

                if (Math.abs(slopeTp2 - slopeTp1) > slopeChangeThreshold ||
                    Math.abs(slopeTf2 - slopeTf1) > slopeChangeThreshold) {
                    times.add(p2.t / 1000);
                }
            }
            
            for (let i = 1; i < samplesToConsider.length; i++) {
                const currentSample = samplesToConsider[i];
                const prevSample = samplesToConsider[i - 1];
                const timeDiffMs = currentSample.t - prevSample.t;
                
                const tpChange = Math.abs(currentSample.tp - prevSample.tp);
                const tfChange = Math.abs(currentSample.tf - prevSample.tf);

                const isRapidChange = (tpChange >= 1.0 || tfChange >= 1.0) && timeDiffMs < 500;
                const isModerateChange = (tpChange >= 0.4 || tfChange >= 0.4) && timeDiffMs < 250;
                
                const isCorner = i > 1 && 
                               ((Math.abs(samplesToConsider[i].tp - samplesToConsider[i-1].tp) > Math.abs(samplesToConsider[i-1].tp - samplesToConsider[i-2].tp) * 2 && Math.abs(samplesToConsider[i-1].tp - samplesToConsider[i-2].tp) < 0.2) ||
                               (Math.abs(samplesToConsider[i].tf - samplesToConsider[i-1].tf) > Math.abs(samplesToConsider[i-1].tf - samplesToConsider[i-2].tf) * 2 && Math.abs(samplesToConsider[i-1].tf - samplesToConsider[i-2].tf) < 0.2));


                if (isRapidChange || isModerateChange || isCorner) {
                     const time = currentSample.t / 1000;
                     times.add(time);
                }
            }

            const sortedTimes = Array.from(times).sort((a, b) => a - b);
            const filteredTimes = [];

            if (sortedTimes.length > 0) {
                if (sortedTimes[0] > 0.1) {
                    filteredTimes.push(sortedTimes[0]);
                }
                
                for (let i = 1; i < sortedTimes.length; i++) {
                    if (filteredTimes.length > 0 && sortedTimes[i] - filteredTimes[filteredTimes.length - 1] > minTimeDiffMs / 1000) {
                        filteredTimes.push(sortedTimes[i]);
                    } else if (filteredTimes.length === 0) {
                         if (sortedTimes[i] > 0.1) {
                             filteredTimes.push(sortedTimes[i]);
                         }
                    }
                }
            }
            
            return filteredTimes.filter(time => time > 0.1).sort((a,b) => a-b);
        };
        
        const absoluteTargetChangeTimes = findPhaseChangeTimes(samples);
        
        const targetChangeTimes = absoluteTargetChangeTimes.map(absoluteTimeInSec => {
            const absoluteTimeInMillis = absoluteTimeInSec * 1000;
            return (absoluteTimeInMillis - startTime) / 1000;
        }).filter(t => t >= 0); 

        const createDatasets = (yAxisID) => {
            return Object.keys(datasetConfig)
                .filter(key => datasetConfig[key].yAxisID === yAxisID)
                .map(key => {
                    const config = datasetConfig[key];
                    return {
                        label: config.label,
                        data: chartDataStore[key],
                        borderColor: isDarkMode() ? config.color : config.lightColor,
                        backgroundColor: config.backgroundColor || 'transparent',
                        fill: config.fill || false,
                        yAxisID: config.yAxisID,
                        borderDash: config.dash || [],
                        hidden: !config.visible,
                        borderWidth: config.width || 2,
                        pointRadius: 0,
                        tension: 0.4
                    };
                });
        };

        const mainChartDatasets = createDatasets('yPrimary');
        const temperatureChartDatasets = createDatasets('yTemp');
        
        const allTemps = [...(chartDataStore.ct || []), ...(chartDataStore.tt || [])].filter(t => t != null && !isNaN(t));
        const minTemp = allTemps.length > 0 ? Math.floor(Math.min(...allTemps)) - 1 : 80;
        const maxTemp = allTemps.length > 0 ? Math.ceil(Math.max(...allTemps)) + 1 : 100;
        
        const progressiveDraw = (context) => {
            const index = context.dataIndex;
            return index * 10;
        };
        
        const finalTime = chartDataStore.t.length > 0 ? chartDataStore.t[chartDataStore.t.length - 1] : 30;
        originalMaxTime = finalTime;

        const onZoomOrPan = ({chart}) => {
            const newMin = chart.scales.x.min;
            const newMax = chart.scales.x.max;
            const otherChart = chart.canvas.id === 'mainChart' ? temperatureChart : mainChart;

            if (otherChart.options.scales.x.min !== newMin || otherChart.options.scales.x.max !== newMax) {
                otherChart.options.scales.x.min = newMin;
                otherChart.options.scales.x.max = newMax;
                otherChart.update('none');
            }
        };

        const zoomOptions = {
            pan: {
                enabled: true,
                mode: 'x',
                onPanComplete: onZoomOrPan,
                limits: {
                    x: { min: 0, max: finalTime }
                }
            },
            zoom: {
                drag: {
                    enabled: true,
                },
                mode: 'x',
                onZoomComplete: onZoomOrPan,
                limits: {
                    x: { min: 0, max: finalTime }
                }
            }
        };
        
        const fileStartTime = shotData.samples[0]?.t || 0;
        const shotStartIndex = shotData.samples.findIndex(s => (s.tp > 0 || s.tf > 0));
        let annotationTimeInSecs = null;
        let annotationPressure = null;

        if (shotStartIndex !== -1) {
            const annotationIndex = shotData.samples.findIndex((s, index) => index >= shotStartIndex && s.v > 0);
            
            if (annotationIndex !== -1) {
                const annotationSample = shotData.samples[annotationIndex];
                annotationTimeInSecs = (annotationSample.t - fileStartTime) / 1000;
                annotationPressure = annotationSample.cp;
            }
        }

        const baseOptions = {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'x', intersect: false },
            layout: { padding: { left: 20, top: 30 } },
            events: ['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove'],
            animation: {
                x: {
                    type: 'number',
                    easing: 'linear',
                    duration: 100,
                    from: NaN,
                    delay: progressiveDraw
                },
                y: {
                    type: 'number',
                    easing: 'linear',
                    duration: 100,
                    from: 0,
                    delay: progressiveDraw
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    enabled: false,
                },
                zoom: zoomOptions 
            }
        };

        mainChart = new Chart(mainCtx, {
            type: 'line',
            data: { labels: labels, datasets: mainChartDatasets },
            options: {
                ...baseOptions,
                plugins: { 
                    ...baseOptions.plugins, 
                    targetChangeLines: { lines: targetChangeTimes },
                    annotation: {
                        animations: {
                            radius: {
                                duration: 2000,
                                easing: 'easeOutBounce',
                                from: 0,
                                to: 10,
                                loop: false
                            }
                        },
                        annotations: {
                            xMark: {
                                type: 'point',
                                xValue: annotationTimeInSecs,
                                yValue: annotationPressure,
                                pointStyle: 'crossRot', 
                                radius: 8,
                                borderWidth: 3,
                                borderColor: '#FF0000', 
                                display: annotationTimeInSecs !== null
                            }
                        }
                    }
                },
                scales: { x: getXAxisConfig(finalTime), yPrimary: { ...getYAxisConfig(), title: { ...getYAxisConfig().title, text: 'Pressure / Flow / Volume' } } },
            }
        });

        temperatureChart = new Chart(tempCtx, {
            type: 'line',
            data: { labels: labels, datasets: temperatureChartDatasets },
            options: {
                ...baseOptions,
                plugins: { 
                    ...baseOptions.plugins, 
                    targetChangeLines: { lines: targetChangeTimes },
                },
                scales: { 
                    x: getXAxisConfig(finalTime), 
                    yTemp: { 
                        ...getYAxisConfig(), 
                        min: minTemp, 
                        max: maxTemp, 
                        title: { ...getYAxisConfig().title, text: 'Temperature (°C)' },
                        ticks: {
                            ...getYAxisConfig().ticks,
                            stepSize: 1
                        }
                    } 
                },
            }
        });
        
        const resetZoom = () => {
            if(mainChart) mainChart.resetZoom('none');
            if(temperatureChart) temperatureChart.resetZoom('none');
        };
        mainChart.canvas.addEventListener('dblclick', resetZoom);
        temperatureChart.canvas.addEventListener('dblclick', resetZoom);

        chartsContainer.addEventListener('mousemove', (e) => masterSyncHandler(e));
        chartsContainer.addEventListener('mouseleave', () => masterMouseoutHandler());

        updateChartColors(); 

        generateCustomLegend('mainChartLegend', mainChart, datasetConfigStore);
        generateCustomLegend('temperatureChartLegend', temperatureChart, datasetConfigStore);
        
        updateTempDifference();
        
        clearLegendValues(mainChart);
        clearLegendValues(temperatureChart);
    }
    
    function updateChartColors() {
        if (!mainChart || !temperatureChart) return;
        const updateColors = (chart, config) => {
            chart.data.datasets.forEach(dataset => {
                const key = Object.keys(config).find(k => config[k].label === dataset.label);
                if (key) {
                    dataset.borderColor = isDarkMode() ? config[key].color : config[key].lightColor;
                }
            });

            Object.values(chart.options.scales).forEach(scale => {
                scale.grid.color = isDarkMode() ? 'rgba(60, 64, 67, 0.3)' : 'rgba(218, 220, 224, 0.3)';
                scale.ticks.color = isDarkMode() ? '#F5F5F5' : '#212121';
                if(scale.title) scale.title.color = isDarkMode() ? '#F5F5F5' : '#212121';
                if(scale.border) scale.border.color = isDarkMode() ? '#F5F5F5' : '#212121';
            });
        };
        
        updateColors(mainChart, datasetConfigStore);
        updateColors(temperatureChart, datasetConfigStore);
    }
    
    function getXAxisConfig(maxTime) {
        return {
            type: 'linear',
            grid: { 
                color: isDarkMode() ? 'rgba(60, 64, 67, 0.3)' : 'rgba(218, 220, 224, 0.3)',
                borderDash: [4, 4]
            },
            border: {
                display: true,
                color: isDarkMode() ? '#3C4043' : '#dadce0',
                width: 1,
                dash: []
            },
            afterBuildTicks: (axis) => {
                const visibleRange = axis.max - axis.min;
                const totalDuration = axis.chart.options.scales.x.max;

                let stepSize;
                if (visibleRange <= 10) {
                    stepSize = 1;
                } else if (totalDuration <= 50) {
                    stepSize = 2;
                } else {
                    stepSize = 5;
                }

                const newTicks = [];
                const firstTickValue = Math.ceil(axis.min / stepSize) * stepSize;

                for (let i = firstTickValue; i <= axis.max; i += stepSize) {
                    if (i <= axis.max + 0.001) { 
                        newTicks.push({ value: i });
                    }
                }
                axis.ticks = newTicks;
            },
            ticks: { 
                color: isDarkMode() ? '#A0A2A5' : '#5f6368', 
                autoSkip: false, 
                callback: function(value) {
                    return Math.round(value) + 's';
                }
            },
            title: { display: false },
            min: 0,
            max: maxTime 
        };
    }

    function getYAxisConfig() {
        return {
            type: 'linear', position: 'left',
            grid: { 
                color: isDarkMode() ? 'rgba(60, 64, 67, 0.3)' : 'rgba(218, 220, 224, 0.3)',
                borderDash: [4, 4]
            },
            border: {
                display: true,
                color: isDarkMode() ? '#3C4043' : '#dadce0',
                width: 1,
                dash: []
            },
            ticks: { color: isDarkMode() ? '#A0A2A5' : '#5f6368', padding: 10 },
            title: { display: true, color: isDarkMode() ? '#A0A2A5' : '#5f6368' },
            min: 0,
        };
    }

    function generateCustomLegend(containerId, chart, config) {
        const legendContainer = document.getElementById(containerId);
        legendContainer.innerHTML = '';

        let legendItems = [];

        if (containerId === 'mainChartLegend') {
            const desiredOrder = ['t', 'cp', 'tp', 'fl', 'tf', 'pf', 'vf', 'v', 'ev', 'cp_compare', 'fl_compare'];
            
            desiredOrder.forEach(key => {
                if (config[key]) { 
                    if (key === 't') {
                        legendItems.push({ ...config.t, datasetIndex: undefined });
                    } else {
                        const datasetIndex = chart.data.datasets.findIndex(d => d.label === config[key].label);
                        if (datasetIndex !== -1) {
                            legendItems.push({ ...config[key], datasetIndex: datasetIndex });
                        }
                    }
                }
            });
        } else {
            legendItems = chart.data.datasets.map((dataset, index) => ({
                ...config[Object.keys(config).find(k => config[k].label === dataset.label)],
                datasetIndex: index
            }));
        }

        let comparisonItemsStarted = false;

        legendItems.forEach(item => {
            if (item.label.includes('(Compare)') && !comparisonItemsStarted) {
                const breakElement = document.createElement('div');
                breakElement.className = 'legend-break';
                legendContainer.appendChild(breakElement);
                comparisonItemsStarted = true;
            }

            const legendItem = document.createElement('div');
            const isDataset = item.datasetIndex !== undefined;
            const isHidden = isDataset && !chart.isDatasetVisible(item.datasetIndex);
            
            legendItem.className = 'legend-item' + (isHidden ? ' hidden' : '');
            if (isDataset) {
                legendItem.onclick = () => {
                    chart.setDatasetVisibility(item.datasetIndex, !chart.isDatasetVisible(item.datasetIndex));
                    legendItem.classList.toggle('hidden', !chart.isDatasetVisible(item.datasetIndex));
                    chart.update('none');
                };
            } else {
                legendItem.style.cursor = 'default';
            }

            const colorDot = document.createElement('span');
            colorDot.className = 'legend-color-dot';

            if (item.label === 'Time') {
                colorDot.innerHTML = '⏱️';
                colorDot.style.backgroundColor = 'transparent';
                colorDot.style.fontSize = '14px';
                colorDot.style.width = 'auto';
                colorDot.style.height = 'auto';
                colorDot.style.borderRadius = '0';
                colorDot.style.lineHeight = '1';
            } else if (isDataset) {
                colorDot.style.backgroundColor = isDarkMode() ? item.color : item.lightColor;
            } else {
                 colorDot.style.backgroundColor = 'transparent';
            }

            const labelText = document.createElement('span');
            labelText.className = 'legend-label-text';
            labelText.textContent = `${item.label}:`;
            
            const labelValue = document.createElement('span');
            labelValue.className = 'legend-label-value';
            labelValue.id = `${chart.canvas.id}-legend-${item.label.replace(/\s+/g, '')}`;
            
            legendItem.appendChild(colorDot);
            legendItem.appendChild(labelText);
            legendItem.appendChild(labelValue);
            legendContainer.appendChild(legendItem);
        });

        if (containerId === 'temperatureChartLegend') {
            const legendItem = document.createElement('div');
            legendItem.className = 'legend-item';
            legendItem.style.cursor = 'default';

            const colorDot = document.createElement('span');
            colorDot.className = 'legend-color-dot';
            colorDot.innerHTML = '<strong>Δ</strong>';
            colorDot.style.backgroundColor = 'transparent';
            colorDot.style.width = 'auto';
            colorDot.style.height = 'auto';
            colorDot.style.borderRadius = '0';
            colorDot.style.textAlign = 'center';
            colorDot.style.minWidth = '12px';
            colorDot.style.fontSize = '14px';
            colorDot.style.lineHeight = '1';

            const labelText = document.createElement('span');
labelText.className = 'legend-label-text';
            labelText.textContent = 'Difference:';

            const labelValue = document.createElement('span');
            labelValue.className = 'legend-label-value';
            labelValue.id = 'temp-diff-value';

            legendItem.appendChild(colorDot);
            legendItem.appendChild(labelText);
            legendItem.appendChild(labelValue);
            legendContainer.appendChild(legendItem);
        }
    }

    function updateLegendValues(chart, primaryIndex, compareIndex, hoverTime) {
        const config = datasetConfigStore;
        Object.keys(config).forEach(key => {
            const valueEl = document.getElementById(`${chart.canvas.id}-legend-${config[key].label.replace(/\s+/g, '')}`);
            if (valueEl) {
                let value = null;
                if (key.includes('_compare')) {
                    if (compareDataStore && compareIndex !== -1 && hoverTime <= (compareDataStore.t[compareDataStore.t.length-1] || 0) ) {
                        value = compareDataStore[key.replace('_compare', '')]?.[compareIndex];
                    }
                } else {
                    if (primaryIndex !== -1 && hoverTime <= (chartDataStore.t[chartDataStore.t.length-1] || 0) ) {
                         value = chartDataStore[key]?.[primaryIndex];
                    }
                }

                if (value !== undefined && value !== null) {
                    valueEl.textContent = `${value.toFixed(2)} ${config[key].unit || ''}`;
                } else {
                     valueEl.textContent = '---';
                }
            }
        });

        if (chart.canvas.id === 'temperatureChart') {
            const tempDiffElement = document.getElementById('temp-diff-value');
            if (tempDiffElement) {
                const currentTemp = chartDataStore.ct?.[primaryIndex];
                const targetTemp = chartDataStore.tt?.[primaryIndex];
                if (currentTemp != null && targetTemp != null) {
                    const difference = targetTemp - currentTemp;
                    tempDiffElement.textContent = `${difference.toFixed(2)} °C`;
                } else {
                    tempDiffElement.textContent = '---';
                }
            }
        }
    }

    function clearLegendValues(chart) {
        chart.data.datasets.forEach(dataset => {
             const valueEl = document.getElementById(`${chart.canvas.id}-legend-${dataset.label.replace(/\s+/g, '')}`);
             if(valueEl) valueEl.innerHTML = '&nbsp;';
        });
        const timeValueEl = document.getElementById(`${chart.canvas.id}-legend-Time`);
        if(timeValueEl) timeValueEl.innerHTML = '&nbsp;';
        const compareKeys = Object.keys(datasetConfigStore).filter(k => k.includes('_compare'));
        compareKeys.forEach(key => {
            const valueEl = document.getElementById(`${chart.canvas.id}-legend-${datasetConfigStore[key].label.replace(/\s+/g, '')}`);
            if (valueEl) valueEl.innerHTML = '&nbsp;';
        });
    }

    function setupRatioCalculator(yieldValue, defaultRatioText) {
        const doseInput = document.getElementById('doseInput');
        const ratioOutput = document.getElementById('ratioOutput');

        if (doseInput && ratioOutput) {
            doseInput.addEventListener('input', () => {
                const dose = parseFloat(doseInput.value);
                const yieldVal = parseFloat(yieldValue);

                if (!isNaN(dose) && dose > 0 && !isNaN(yieldVal)) {
                    const ratio = yieldVal / dose;
                    ratioOutput.textContent = `1:${ratio.toFixed(2)}`;
                } else {
                    ratioOutput.innerHTML = `<span class="placeholder-text">${defaultRatioText}</span>`;
                }
            });
        }
    }
    
    function displayShotDetails(data) {
        const yieldValue = data.volume ? data.volume.toFixed(1) : 'N/A';
        const peakPressure = data.samples && data.samples.length > 0 ? Math.max(...data.samples.map(s => s.cp || 0)).toFixed(1) : 'N/A';
        
        const targetTemps = data.samples.map(s => s.tt).filter(t => t > 0);
        const tempValue = targetTemps.length > 0 ? Math.round(targetTemps[0]) + '°C' : 'N/A';
        
        let pressureValue = 'N/A';
        if (data.samples && data.samples.length > 0) {
            const finalPressure = data.samples[data.samples.length - 1].cp.toFixed(1);
            pressureValue = `${peakPressure} &rarr; ${finalPressure} bar`;
        }
        
        const shotStartIndex = data.samples.findIndex(s => (s.tp > 0 || s.tf > 0));
        
        let timeValue = data.duration ? (data.duration / 1000).toFixed(1) : 'N/A';
        if (shotStartIndex !== -1 && data.samples.length > 0) {
            const shotStartTime = data.samples[shotStartIndex].t;
            const lastSampleTime = data.samples[data.samples.length - 1].t;
            timeValue = ((lastSampleTime - shotStartTime) / 1000).toFixed(1);
        }
        
        let firstDripsValue = 'N/A';
        if (shotStartIndex !== -1) {
            const shotStartTime = data.samples[shotStartIndex].t;
            const firstDripIndex = data.samples.findIndex((s, index) => index >= shotStartIndex && s.v > 0);
            if (firstDripIndex !== -1) {
                const firstDripTime = data.samples[firstDripIndex].t;
                firstDripsValue = ((firstDripTime - shotStartTime) / 1000).toFixed(1);
            }
        }
        
        let defaultRatioText = 'N/A';
        if (yieldValue !== 'N/A') {
            const defaultRatio = parseFloat(yieldValue) / 18.0;
            defaultRatioText = `1:${defaultRatio.toFixed(2)}`;
        }
        
        const date = new Date(data.timestamp * 1000);
        const options = {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        };
        const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(date);
        const find = (partType) => parts.find(p => p.type === partType)?.value || '';
        const formattedTimestamp = data.timestamp 
            ? `${find('weekday')}, ${find('month')} ${find('day')}, ${find('year')} at ${find('hour')}:${find('minute')} ${find('dayPeriod')}`
            : 'N/A';
        
        shotDetailsContainer.innerHTML = `
            <div class="profile-info">
                <h2>${data.profile || 'Shot Profile'}</h2>
                <p class="timestamp">${formattedTimestamp}</p>
            </div>
            <textarea id="shotDescription" class="description-input" rows="2" placeholder="Notes:"></textarea>
        `;
        
        shotVitalsContainer.innerHTML = `
            <h3>Shot Metrics</h3>
            
            <h4>☕ Coffee & Dose</h4>
            <div class="vitals-row">
                <span class="vitals-label">Dose:</span>
                <span class="vitals-value">
                    <input type="number" id="doseInput" class="vitals-input" placeholder="18.0" step="0.1"><span class="vitals-unit">g</span>
                </span>
            </div>
            <div class="vitals-row">
                <span class="vitals-label">Grinder:</span>
                <span class="vitals-value"><input type="text" class="vitals-input" placeholder="Lagom Casa"></span>
            </div>
            <div class="vitals-row">
                <span class="vitals-label">Grind Setting:</span>
                <span class="vitals-value"><input type="number" class="vitals-input" placeholder="7.0" step="0.1"></span>
            </div>
            <div class="vitals-row">
                <span class="vitals-label">Beans:</span>
                <span class="vitals-value"><input type="text" class="vitals-input" placeholder="Alto Grande"></span>
            </div>
            
            <h4>📊 Extraction</h4>
            <div class="vitals-row">
                <span class="vitals-label">Yield:</span>
                <span class="vitals-value">${yieldValue}<span class="vitals-unit">g</span></span>
            </div>
            <div class="vitals-row">
                <span class="vitals-label">Time:</span>
                <span class="vitals-value">${timeValue}<span class="vitals-unit">s</span></span>
            </div>
            <div class="vitals-row">
                <span class="vitals-label">Ratio:</span>
                <span class="vitals-value" id="ratioOutput"><span class="placeholder-text">${defaultRatioText}</span></span>
            </div>
            <div class="vitals-row">
                <span class="vitals-label">First Drips:</span>
                <span class="vitals-value">${firstDripsValue}<span class="vitals-unit">s</span></span>
            </div>
            <div class="vitals-row">
                <span class="vitals-label">Peak Pressure:</span>
                <span class="vitals-value">${peakPressure}<span class="vitals-unit">bar</span></span>
            </div>
             <div class="vitals-row">
                <span class="vitals-label">Temp:</span>
                <span class="vitals-value">${tempValue}</span>
            </div>
            <div class="vitals-row">
                <span class="vitals-label">Pressure:</span>
                <span class="vitals-value">${pressureValue}</span>
            </div>

            <h4>😋 Taste</h4>
             <div class="vitals-row">
                <span class="vitals-label">Rating:</span>
                <span class="vitals-value"><input type="text" class="vitals-input" placeholder="8/10"></span>
            </div>
            <div class="vitals-row-full">
                <span class="vitals-label">Taste Notes:</span>
                <textarea class="vitals-textarea" rows="6" placeholder="Balanced sweetness, nutty, low acidity"></textarea>
            </div>
        `;

        setupRatioCalculator(yieldValue, defaultRatioText);
        
        const allTextInputs = document.querySelectorAll('#shotDescription, #shotVitals .vitals-input, #shotVitals .vitals-textarea');
        allTextInputs.forEach(input => {
            input.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault(); 
                    input.blur(); 
                }
            });
        });
    }

    // Initial theme setup
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        themeToggle.checked = true;
        document.body.classList.add('light-mode');
    } else {
        themeToggle.checked = false;
        document.body.classList.remove('dark-mode');
    }
});