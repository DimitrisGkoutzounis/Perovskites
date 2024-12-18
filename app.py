import os
import re
import pandas as pd
import matplotlib.pyplot as plt
from datetime import datetime
from flask import Flask, request, render_template, redirect, url_for, flash, send_file
from io import BytesIO
import base64

app = Flask(__name__)
app.secret_key = 'your_secret_key'

directory_path = 'uploads'
plot_buffer = None

if not os.path.exists(directory_path):
    os.makedirs(directory_path)

def extract_data_from_file(filepath):
    with open(filepath, "r") as file:
        lines = file.readlines()
        Device = Date = Time = None
        scan_rate = gate_start = None
        data_start_index = None

        for i, line in enumerate(lines):
            if line.startswith("Device\t"):
                Device = line.strip().split("\t")[1]
            elif line.startswith("Date\t"):
                Date = line.strip().split("\t")[1]  
            elif line.startswith("Time\t"):
                Time = line.strip().split("\t")[1]
            elif "Scan Rate (mV/s)" in line:
                                scan_rate = float(line.strip().split("\t")[1])
            elif line.startswith("[Gate Settings]"):
                gate_line = lines[i + 1]
                matches = re.findall(r"[-+]?(?:\d*\.\d+|\d+)", gate_line)
                if matches:
                    gate_start = float(matches[0])
            elif line.startswith("## Data ##"):
                col_titles_line = lines[i + 1].strip()
                data_start_index = i + 2
                break

        if data_start_index is None:
            raise ValueError("Data section not found in the file.")

        col_titles = col_titles_line.split("\t")
        data = []
        for line in lines[data_start_index:]:
            try:
                data.append([float(x) for x in line.split("\t")])
            except ValueError:
                continue  # Skip invalid rows

        df = pd.DataFrame(data, columns=col_titles)
        return df, Device, Date, Time, scan_rate, gate_start
      
# Plotting the data
def plot_data(df, parameter, Device, Date, Time, scan_rate):
    try:
        if parameter not in df.columns:
            raise ValueError(f"Parameter '{parameter}' not found in the DataFrame columns.")
        
        fig, axes = plt.subplots(1, 2, figsize=(15, 5))
        axes[0].set_title("Normal Graph")
        axes[1].set_title("Log Graph")
        
        for col in df.columns[1:]:
            axes[0].plot(df[df.columns[0]], df[col], label=col)
            axes[1].semilogy(df[df.columns[0]], df[col].abs() + 1e-9, label=col)  # Avoid log(0)

        for ax in axes:
            ax.set_xlabel(df.columns[0])
            ax.set_ylabel(parameter)
            ax.legend()
            ax.grid(True)

        plt.suptitle(f"[{Device}] [{Date}] [{Time}] [Scan Rate: {scan_rate}]")
        plt.tight_layout(rect=[0, 0.03, 1, 0.97])

        buf = BytesIO()
        plt.savefig(buf, format="png")
        buf.seek(0)
        plot_data = base64.b64encode(buf.getvalue()).decode('utf8')
        plt.close()
        return plot_data, buf
    except Exception as e:
        print(f"An error occurred while plotting: {e}")
        return None, None


@app.route('/', methods=['GET', 'POST'])
def index():
    if request.method == 'POST':
        name = request.form['name']
        flash(f'Welcome, {name}!')
        return redirect(url_for('main_page', username=name))
    return render_template('index.html')

@app.route('/main', methods=['GET', 'POST'])
def main_page():
    global plot_buffer
    plot_url = None  
    username = request.args.get('username', 'User')

    if request.method == 'POST':
        if 'file' in request.files:
            file = request.files['file']
            if file and file.filename != '':
                filepath = os.path.join(directory_path, file.filename)
                file.save(filepath)
                flash(f'File "{file.filename}" uploaded successfully and ready for plotting.', 'info')
        elif 'parameter' in request.form:
            parameter = request.form['parameter']
            
            for filename in os.listdir(directory_path):
                if filename.endswith('.txt'):
                    filepath = os.path.join(directory_path, filename)
                    
                    try:
                        df, Device, Date, Time, scan_rate, gate_start = extract_data_from_file(filepath)

                    except Exception as e:
                        flash(f'Error extracting data from file "{filename}". Please check the file format.', 'danger')
                        return render_template('main.html', plot_url=plot_url, username=username)
                    
                    if parameter not in df.columns:
                        flash(f'Parameter "{parameter}" is not available in the uploaded file "{filename}". Available parameters: {", ".join(df.columns)}', 'danger')
                        return render_template('main.html', plot_url=plot_url, username=username)

                    
                    plot_url, plot_buffer = plot_data(df, parameter, Device, Date, Time, scan_rate)
                    
                    if plot_url:
                        flash(f'Plot for file "{filename}" generated successfully.', 'success')
                    else:
                        flash(f'An error occurred while generating the plot for file "{filename}". Please check the logs.', 'danger')
    
    return render_template('main.html', plot_url=plot_url, username=username)


@app.route('/download', methods=['GET'])
def download_plot():
    global plot_buffer
    if plot_buffer:
        return send_file(BytesIO(plot_buffer.getvalue()), as_attachment=True, attachment_filename='plot.png', 
                         mimetype='image/png')
    else:
        flash('No plot available for download.', 'danger')  
        return redirect(url_for('main_page'))


if __name__ == '__main__':
    app.run(debug=True)